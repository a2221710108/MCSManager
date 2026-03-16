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

const props = defineProps<{ daemonId: string; instanceId: string; }>();

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

const normalizePath = (path: string) => {
  return path.replace(/\/+$/, "") + "/";
};

// --- 重構後的智慧掃描 ---
const deepScanWorlds = async (targetPath: string, results: DetectedWorld[] = []) => {
  const currentPath = normalizePath(targetPath);
  console.log(`[Scanning] Checking directory: ${currentPath}`);
  
  try {
    const res = await fetchFiles({
      params: { 
        daemonId: props.daemonId, uuid: props.instanceId, 
        target: currentPath, page: 0, page_size: 100, file_name: "" 
      }
    });
    
    const items = res.value?.items || [];
    console.log(`[Scanning] Found ${items.length} items in ${currentPath}`);

    // 檢查是否有 level.dat
    const hasLevelDat = items.some(i => i.name.toLowerCase() === "level.dat");

    if (hasLevelDat) {
      console.log(`[Found] level.dat detected at: ${currentPath}`);
      const lowerPath = currentPath.toLowerCase();
      results.push({
        path: currentPath,
        isNether: lowerPath.includes("nether") || lowerPath.includes("dim-1"),
        isEnd: lowerPath.includes("the_end") || lowerPath.includes("dim1") || (lowerPath.includes("end") && !lowerPath.includes("friend"))
      });
    }

    // 使用 for...of 確保異步順序執行
    for (const item of items) {
      if (item.type === 1) { // 僅處理資料夾
        const folderName = item.name.toLowerCase();
        // 排除掉不可能是存檔目錄的地方，避免無限遞歸
        if (["logs", "plugins", "cache", "region", "entities", "poi", "playerdata"].includes(folderName)) continue;
        
        await deepScanWorlds(`${currentPath}${item.name}/`, results);
      }
    }
  } catch (e) {
    console.error(`[Scan Error] Failed to scan ${currentPath}:`, e);
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
    content: t("系統將分析結構並自動對齊維度，覆蓋原有 /world 目錄。"),
    onOk: async () => {
      try {
        uploading.value = true;
        const tempDirName = `tmp_map_${Date.now()}`;
        
        // --- 1. 上傳 ---
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

        // --- 2. 解壓 ---
        message.loading({ content: t("正在解壓分析..."), key: msgKey });
        await executeCompress({
          params: { uuid: props.instanceId, daemonId: props.daemonId },
          data: { type: 2, code: "utf-8", source: "/" + file.name, targets: `/${tempDirName}/` }
        });

        // --- 3. 掃描與決策 ---
        console.log("--- Starting Deep Scan Process ---");
        const allDetected = await deepScanWorlds(`/${tempDirName}/`);
        console.log("--- Scan Finished ---", allDetected);

        const mainWorld = allDetected
          .filter(w => !w.isNether && !w.isEnd)
          .sort((a, b) => a.path.length - b.path.length)[0];

        if (!mainWorld) {
          throw new Error(t("無法在壓縮包中定位 level.dat。請確保上傳的是正確的存檔包。"));
        }

        const moveTargets: [string, string][] = [[mainWorld.path, "/world/"]];
        const deleteTargets = ["/world", "/world_nether", "/world_the_end"];

        const nether = allDetected.find(w => w.isNether);
        if (nether && !nether.path.startsWith(mainWorld.path)) {
          moveTargets.push([nether.path, "/world_nether/"]);
        }

        const end = allDetected.find(w => w.isEnd);
        if (end && !end.path.startsWith(mainWorld.path)) {
          moveTargets.push([end.path, "/world_the_end/"]);
        }

        // --- 4. 套用 ---
        message.loading({ content: t("正在重組目錄..."), key: msgKey });
        await executeDelete({
          params: { daemonId: props.daemonId, uuid: props.instanceId },
          data: { targets: deleteTargets }
        });

        await executeMove({
          params: { daemonId: props.daemonId, uuid: props.instanceId },
          data: { targets: moveTargets }
        });

        // --- 5. 清理 ---
        await executeDelete({
          params: { daemonId: props.daemonId, uuid: props.instanceId },
          data: { targets: ["/" + file.name, "/" + tempDirName] }
        });

        message.success({ content: t("智慧替換成功！"), key: msgKey });
        open.value = false;
      } catch (err: any) {
        message.error({ content: t("失敗: ") + err.message, key: msgKey });
      } finally {
        uploading.value = false;
      }
    }
  });
};

defineExpose({ openDialog });
</script>

<template>
  <a-modal v-model:open="open" :title="t('地圖智慧替換')" :footer="null" centered :mask-closable="!uploading" width="480px">
    <div class="p-4">
      <div v-if="!uploading">
        <a-upload-dragger :show-upload-list="false" :before-upload="(file: any) => { handleMapReplace(file); return false; }">
          <p class="ant-upload-drag-icon"><CloudUploadOutlined /></p>
          <p class="ant-upload-text">拖入地圖壓縮包</p>
          <p class="ant-upload-hint">自動對齊 /world、/world_nether 等目錄</p>
        </a-upload-dragger>
      </div>

      <div v-else class="py-10 text-center">
        <div class="mb-4 flex items-center justify-center">
          <LoadingOutlined v-if="uploadData.current" spin />
          <InteractionOutlined v-else spin />
          <span class="ml-2 text-base">
            {{ uploadData.current ? t('正在傳輸...') : t('分析重組中...') }}
          </span>
        </div>

        <div v-if="uploadData.current" class="px-6">
          <a-progress :percent="progress" status="active" :stroke-color="{ '0%': '#108ee9', '100%': '#87d068' }" />
          <div class="mt-2 text-xs text-gray-400">
            {{ convertFileSize(uploadData.current[0].toString()) }} / {{ convertFileSize(uploadData.current[1].toString()) }}
          </div>
        </div>
        <div v-else class="px-6">
          <a-alert :message="t('正在定位存檔特徵並對齊，請勿刷新頁面') " type="info" show-icon />
        </div>
      </div>
    </div>
  </a-modal>
</template>

<style scoped>
.ml-2 { margin-left: 8px; }
:deep(.ant-upload-drag) { border-radius: 12px; }
</style>
