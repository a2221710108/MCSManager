<script setup lang="ts">
import { ref, computed, watch } from "vue";
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
  InteractionOutlined,
  LoadingOutlined 
} from "@ant-design/icons-vue";
import uploadService from "@/services/uploadService";
import { parseForwardAddress } from "@/tools/protocol";

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

// --- 全深度智慧掃描 ---
const deepScanWorlds = async (targetPath: string, results: DetectedWorld[] = [], depth = 0) => {
  const currentPath = normalizePath(targetPath);
  if (depth > 6) return results; 

  try {
    const res = await fetchFiles({
      params: { 
        daemonId: props.daemonId, uuid: props.instanceId, 
        target: currentPath, page: 0, page_size: 100, file_name: "" 
      }
    });
    
    const items = res.value?.items || [];
    console.log(`[Scanning] ${currentPath} (${items.length} items)`);

    // 檢查是否有 level.dat
    const hasLevelDat = items.some(i => i.name.toLowerCase() === "level.dat");

    if (hasLevelDat) {
      const lowerPath = currentPath.toLowerCase();
      const isNether = lowerPath.includes("nether") || lowerPath.includes("dim-1");
      const isEnd = (lowerPath.includes("the_end") || lowerPath.includes("dim1") || lowerPath.includes("end")) && !lowerPath.includes("friend");
      
      console.log(`%c[Found World] ${isNether ? 'Nether' : isEnd ? 'End' : 'Main'}: ${currentPath}`, "color: #1890ff; font-weight: bold;");
      results.push({ path: currentPath, isNether, isEnd });
    }

    // 遞歸子目錄 (僅限資料夾，避免 500 錯誤)
    for (const item of items) {
      if (item.type === 1) {
        const folderName = item.name.toLowerCase();
        // 過濾絕對無關目錄
        if (["logs", "plugins", "cache", "bin", "libraries", "versions", "config"].includes(folderName)) continue;
        await deepScanWorlds(`${currentPath}${item.name}/`, results, depth + 1);
      }
    }
  } catch (e) {
    console.warn(`[Skip] ${currentPath}`);
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
    title: t("確認執行智慧替換？"),
    content: t("系統將掃描所有 level.dat 並強制對齊至標準 /world 結構。這將覆蓋現有存檔。"),
    onOk: async () => {
      try {
        uploading.value = true;
        const tempDirName = `tmp_map_${Date.now()}`;
        
        // 1. 上傳
        message.loading({ content: t("正在上傳..."), key: msgKey });
        const mission = await getUploadMissionCfg({ params: { upload_dir: "/", daemonId: props.daemonId, uuid: props.instanceId, file_name: file.name } });
        const config = mission.value;
        if (!config?.addr) throw new Error("授權失敗");

        await new Promise<void>((resolve) => {
          uploadService.append(file, parseForwardAddress(config.addr, "http"), config.password, { overwrite: true }, (task) => {
            task.instanceInfo = { instanceId: props.instanceId, daemonId: props.daemonId };
          });
          const unwatch = watch(() => uploadService.uiData.value.current, (curr) => { if (!curr) { unwatch(); resolve(); } });
        });

        // 2. 解壓
        message.loading({ content: t("正在解壓..."), key: msgKey });
        await executeCompress({
          params: { uuid: props.instanceId, daemonId: props.daemonId },
          data: { type: 2, code: "utf-8", source: "/" + file.name, targets: `/${tempDirName}/` }
        });

        // 3. 掃描與分析
        message.loading({ content: t("正在執行全深度結構掃描..."), key: msgKey });
        const allDetected = await deepScanWorlds(`/${tempDirName}/`);
        
        // 識別主世界 (最淺層的非維度目錄)
        const mainWorld = allDetected
          .filter(w => !w.isNether && !w.isEnd)
          .sort((a, b) => a.path.length - b.path.length)[0];

        if (!mainWorld) throw new Error(t("找不到有效的 level.dat。"));

        // 4. 精確對齊移動
        message.loading({ content: t("正在重組結構..."), key: msgKey });
        
        // 清理舊資料
        await executeDelete({
          params: { daemonId: props.daemonId, uuid: props.instanceId },
          data: { targets: ["/world", "/world_nether", "/world_the_end"] }
        });

        // 搬運第一步：移動主世界（這會建立 /world/ 根目錄）
        await executeMove({
          params: { daemonId: props.daemonId, uuid: props.instanceId },
          data: { targets: [[mainWorld.path, "/world/"]] }
        });

        // 搬運第二步：將維度「抽離」並塞入 /world/ 內部 (Vanilla 規範)
        const nether = allDetected.find(w => w.isNether);
        if (nether) {
          await executeMove({
            params: { daemonId: props.daemonId, uuid: props.instanceId },
            data: { targets: [[nether.path, "/world/DIM-1/"]] }
          });
        }

        const end = allDetected.find(w => w.isEnd);
        if (end) {
          await executeMove({
            params: { daemonId: props.daemonId, uuid: props.instanceId },
            data: { targets: [[end.path, "/world/DIM1/"]] }
          });
        }

        // 5. 清理臨時檔案
        await executeDelete({
          params: { daemonId: props.daemonId, uuid: props.instanceId },
          data: { targets: ["/" + file.name, "/" + tempDirName] }
        });

        message.success({ content: t("智慧地圖替換完成！"), key: msgKey });
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
          <p class="ant-upload-text">點擊或拖入地圖壓縮包</p>
          <p class="ant-upload-hint">自動對齊主世界、地獄與末地結構</p>
        </a-upload-dragger>
      </div>
      <div v-else class="py-10 text-center">
        <div class="mb-4 flex items-center justify-center">
          <LoadingOutlined v-if="uploadData.current" spin />
          <InteractionOutlined v-else spin />
          <span class="ml-2 text-base">{{ uploadData.current ? t('傳輸中...') : t('分析與對齊結構中...') }}</span>
        </div>
        <a-progress v-if="uploadData.current" :percent="progress" status="active" />
      </div>
    </div>
  </a-modal>
</template>

<style scoped>
.ml-2 { margin-left: 8px; }
:deep(.ant-upload-drag) { border-radius: 12px; }
</style>
