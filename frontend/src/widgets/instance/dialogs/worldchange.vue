<script setup lang="ts">
import { ref, createVNode, computed, watch } from "vue";
import { t } from "@/lang/i18n";
import { message, Modal } from "ant-design-vue";
import { 
  fileList as getFileListApi, 
  deleteFile as deleteFileApi, 
  compressFile as compressFileApi,
  uploadAddress,
  moveFile as moveFileApi 
} from "@/services/apis/fileManager";
import { getInstanceInfo } from "@/services/apis/instance";
import { useScreen } from "@/hooks/useScreen";
import { 
  CloudUploadOutlined, 
  WarningOutlined, 
  InteractionOutlined,
  LoadingOutlined 
} from "@ant-design/icons-vue";
import uploadService from "@/services/uploadService";
import { parseForwardAddress } from "@/tools/protocol";
import { convertFileSize } from "@/tools/fileSize";

const open = ref(false);
const uploading = ref(false);
const { isPhone } = useScreen();

const props = defineProps<{
  daemonId: string;
  instanceId: string;
}>();

const { execute: fetchFiles } = getFileListApi();
const { execute: executeDelete } = deleteFileApi();
const { execute: executeCompress } = compressFileApi();
const { execute: fetchInstanceInfo } = getInstanceInfo();
const { execute: getUploadMissionCfg } = uploadAddress();
const { execute: executeMove } = moveFileApi();

const uploadData = uploadService.uiData;
const progress = computed(() => {
  if (uploadData.value.current) {
    return Math.floor((uploadData.value.current[0] * 100) / uploadData.value.current[1]);
  }
  return 0;
});

interface DetectedWorld {
  path: string;
  isNether: boolean;
  isEnd: boolean;
}

const openDialog = () => { open.value = true; };

// 歸一化路徑，確保結尾只有一個 /
const normalizePath = (path: string) => {
  const p = path.replace(/\/+$/, "");
  return p + "/";
};

// 智慧掃描：找出所有包含 level.dat 的目錄
const deepScanWorlds = async (targetPath: string, results: DetectedWorld[] = []) => {
  const currentPath = normalizePath(targetPath);
  try {
    const res = await fetchFiles({
      params: { 
        daemonId: props.daemonId, uuid: props.instanceId, 
        target: currentPath, page: 0, page_size: 100, file_name: "" 
      }
    });
    
    const items = res.value?.items || [];
    const hasLevelDat = items.some(i => i.name.toLowerCase() === "level.dat");

    if (hasLevelDat) {
      console.log("Found level.dat at:", currentPath);
      const lowerPath = currentPath.toLowerCase();
      results.push({
        path: currentPath,
        isNether: lowerPath.includes("nether") || lowerPath.includes("dim-1"),
        isEnd: lowerPath.includes("the_end") || lowerPath.includes("dim1") || (lowerPath.includes("end") && !lowerPath.includes("friend"))
      });
    }

    for (const item of items) {
      // 排除非資料夾，以及常見的非地圖大資料夾以提升掃描性能
      if (item.type === 1) {
        const folderName = item.name.toLowerCase();
        if (["logs", "plugins", "cache", "region", "entities", "poi"].includes(folderName)) continue;
        await deepScanWorlds(`${currentPath}${item.name}/`, results);
      }
    }
  } catch (e) {
    console.error("Scan Error at " + currentPath, e);
  }
  return results;
};

const handleMapReplace = async (file: File) => {
  const msgKey = "map_replace_task";
  const info = await fetchInstanceInfo({ params: { daemonId: props.daemonId, uuid: props.instanceId } });
  
  if (info.value?.status !== 0) {
    return Modal.warning({ title: t("伺服器運行中"), content: t("請先關閉伺服器。") });
  }

  Modal.confirm({
    title: t("確認智慧替換？"),
    icon: createVNode(WarningOutlined),
    content: t("系統將自動分析結構並對齊 /world，原有地圖將被覆蓋。"),
    onOk: async () => {
      try {
        uploading.value = true;
        const tempDirName = `tmp_map_${Date.now()}`;
        
        // --- 階段 A: 上傳 ---
        message.loading({ content: t("正在準備通道..."), key: msgKey });
        const mission = await getUploadMissionCfg({
          params: { upload_dir: "/", daemonId: props.daemonId, uuid: props.instanceId, file_name: file.name }
        });
        const config = mission.value;
        if (!config?.addr) throw new Error("授權失敗");

        await new Promise<void>((resolve) => {
          uploadService.append(file, parseForwardAddress(config.addr, "http"), config.password, { overwrite: true }, (task) => {
            task.instanceInfo = { instanceId: props.instanceId, daemonId: props.daemonId };
          });
          const unwatch = watch(() => uploadService.uiData.value.current, (curr) => {
            if (!curr) { unwatch(); resolve(); }
          });
        });

        // --- 階段 B: 解壓 ---
        message.loading({ content: t("正在解壓分析..."), key: msgKey });
        await executeCompress({
          params: { uuid: props.instanceId, daemonId: props.daemonId },
          data: { type: 2, code: "utf-8", source: "/" + file.name, targets: `/${tempDirName}/` }
        });

        // --- 階段 C: 智慧識別 ---
        console.log("Starting deep scan...");
        const allDetected = await deepScanWorlds(`/${tempDirName}/`);
        console.log("All detected paths:", JSON.parse(JSON.stringify(allDetected)));

        // 找主世界：路徑最短且不含維度關鍵字
        const mainWorld = allDetected
          .filter(w => !w.isNether && !w.isEnd)
          .sort((a, b) => a.path.length - b.path.length)[0];

        if (!mainWorld) {
          console.error("Scan result empty. Detected list:", allDetected);
          throw new Error(t("壓縮包內找不到有效的主世界存檔 (level.dat)"));
        }

        const moveTargets: [string, string][] = [[mainWorld.path, "/world/"]];
        const deleteTargets = ["/world", "/world_nether", "/world_the_end"];

        // 檢查地獄與末地（若不在主世界目錄下才獨立移動）
        const nether = allDetected.find(w => w.isNether);
        if (nether && !nether.path.startsWith(mainWorld.path)) {
          moveTargets.push([nether.path, "/world_nether/"]);
        }

        const end = allDetected.find(w => w.isEnd);
        if (end && !end.path.startsWith(mainWorld.path)) {
          moveTargets.push([end.path, "/world_the_end/"]);
        }

        // --- 階段 D: 執行對齊 ---
        message.loading({ content: t("正在重組地圖目錄..."), key: msgKey });
        await executeDelete({
          params: { daemonId: props.daemonId, uuid: props.instanceId },
          data: { targets: deleteTargets }
        });

        await executeMove({
          params: { daemonId: props.daemonId, uuid: props.instanceId },
          data: { targets: moveTargets }
        });

        // --- 階段 E: 清理 ---
        await executeDelete({
          params: { daemonId: props.daemonId, uuid: props.instanceId },
          data: { targets: ["/" + file.name, "/" + tempDirName] }
        });

        message.success({ content: t("智慧替換完成！"), key: msgKey });
        open.value = false;
      } catch (err: any) {
        message.error({ content: t("錯誤: ") + err.message, key: msgKey });
      } finally {
        uploading.value = false;
      }
    }
  });
};

defineExpose({ openDialog });
</script>

<template>
  <a-modal v-model:open="open" :title="t('智慧替換地圖')" :footer="null" centered :mask-closable="!uploading" width="480px">
    <div class="p-4">
      <div v-if="!uploading">
        <a-upload-dragger :show-upload-list="false" :before-upload="(file: any) => { handleMapReplace(file); return false; }">
          <p class="ant-upload-drag-icon"><CloudUploadOutlined /></p>
          <p class="ant-upload-text">{{ t('點擊或拖入地圖壓縮包') }}</p>
          <p class="ant-upload-hint">{{ t('自動識別 level.dat 並對齊維度目錄') }}</p>
        </a-upload-dragger>
      </div>

      <div v-else class="status-container py-4">
        <div class="flex items-center justify-center mb-6">
          <LoadingOutlined v-if="uploadData.current" spin />
          <InteractionOutlined v-else spin />
          <span class="ml-2 text-lg">
            {{ uploadData.current ? t('正在上傳...') : t('正在處理文件...') }}
          </span>
        </div>

        <div v-if="uploadData.current" class="px-4">
          <div class="flex justify-between text-sm mb-1">
            <span class="truncate w-64">{{ uploadData.currentFile }}</span>
            <span>{{ progress }}%</span>
          </div>
          <a-progress :percent="progress" status="active" :show-info="false" :stroke-color="{ '0%': '#108ee9', '100%': '#87d068' }" />
          <div class="text-right text-xs text-gray-400 mt-1">
            {{ convertFileSize(uploadData.current[0].toString()) }} / {{ convertFileSize(uploadData.current[1].toString()) }}
          </div>
        </div>
        <div v-else class="px-4">
          <a-alert :message="t('正在執行智慧識別與目錄重組，請勿關閉...') " type="info" />
        </div>
      </div>
      <div class="mt-4 text-center text-gray-300 text-xs">
        <p>* {{ t('支援識別單人存檔 (DIM-1) 或平級維度資料夾結構') }}</p>
      </div>
    </div>
  </a-modal>
</template>

<style scoped>
.status-container { min-height: 180px; display: flex; flex-direction: column; justify-content: center; }
.ml-2 { margin-left: 8px; }
:deep(.ant-upload-drag) { border-radius: 12px; }
</style>
