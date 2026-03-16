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

// --- 強力全深度掃描器 ---
const deepScanWorlds = async (targetPath: string, results: DetectedWorld[] = [], depth = 0) => {
  const currentPath = normalizePath(targetPath);
  
  // 增加深度限制到 10 層，應對極端嵌套
  if (depth > 10) return results; 

  try {
    const res = await fetchFiles({
      params: { 
        daemonId: props.daemonId, uuid: props.instanceId, 
        target: currentPath, page: 0, page_size: 100, file_name: "" 
      }
    });
    
    const items = res.value?.items || [];
    // 調試日誌：查看當前目錄下的所有內容
    console.log(`[Scan D-${depth}] Path: ${currentPath} | Found:`, items.map(i => i.name + (i.type === 1 ? '/' : '')));

    // 1. 檢查當前目錄是否有 level.dat
    const hasLevelDat = items.some(i => i.name.toLowerCase() === "level.dat");

    if (hasLevelDat) {
      const lowerPath = currentPath.toLowerCase();
      const isNether = lowerPath.includes("nether") || lowerPath.includes("dim-1");
      const isEnd = (lowerPath.includes("the_end") || lowerPath.includes("dim1") || lowerPath.includes("end")) && !lowerPath.includes("friend");
      
      console.log(`%c[MATCH] ${isNether ? 'Nether' : isEnd ? 'End' : 'Main'}: ${currentPath}`, "color: #52c41a; font-weight: bold;");
      results.push({ path: currentPath, isNether, isEnd });
    }

    // 2. 遍歷子目錄（遞歸）
    for (const item of items) {
      if (item.type === 1) { // 僅限目錄
        const folderName = item.name.toLowerCase();
        // 過濾掉明顯不包含存檔的系統目錄以節省 API 請求
        if (["logs", "plugins", "cache", "bin", "libraries", "versions", "config", "metadata"].includes(folderName)) continue;
        
        const nextPath = `${currentPath}${item.name}/`;
        await deepScanWorlds(nextPath, results, depth + 1);
      }
    }
  } catch (e) {
    console.warn(`[Skip] 權限不足或路徑錯誤: ${currentPath}`);
  }
  return results;
};

const handleMapReplace = async (file: File) => {
  const msgKey = "map_replace_task";
  const info = await fetchInstanceInfo({ params: { daemonId: props.daemonId, uuid: props.instanceId } });
  
  if (info.value?.status !== 0) {
    return Modal.warning({ title: t("伺服器運行中"), content: t("請先關閉伺服器後再進行地圖替換。") });
  }

  Modal.confirm({
    title: t("確認智慧替換？"),
    content: t("系統將深度掃描壓縮包，自動將主世界、地獄與末地對齊至標準 /world 結構。"),
    onOk: async () => {
      try {
        uploading.value = true;
        const tempDirName = `tmp_map_${Date.now()}`;
        
        // Step 1: 上傳
        message.loading({ content: t("正在建立傳輸通道..."), key: msgKey });
        const mission = await getUploadMissionCfg({
          params: { upload_dir: "/", daemonId: props.daemonId, uuid: props.instanceId, file_name: file.name }
        });
        const config = mission.value;
        if (!config?.addr) throw new Error("獲取上傳地址失敗");

        await new Promise<void>((resolve) => {
          uploadService.append(file, parseForwardAddress(config.addr, "http"), config.password, { overwrite: true }, (task) => {
            task.instanceInfo = { instanceId: props.instanceId, daemonId: props.daemonId };
          });
          const unwatch = watch(() => uploadService.uiData.value.current, (curr) => {
            if (!curr) { unwatch(); resolve(); }
          });
        });

        // Step 2: 解壓
        message.loading({ content: t("正在解壓檔案..."), key: msgKey });
        await executeCompress({
          params: { uuid: props.instanceId, daemonId: props.daemonId },
          data: { type: 2, code: "utf-8", source: "/" + file.name, targets: `/${tempDirName}/` }
        });

        // Step 3: 全深度掃描分析
        message.loading({ content: t("正在進行智慧結構分析..."), key: msgKey });
        const allDetected = await deepScanWorlds(`/${tempDirName}/`);
        
        const mains = allDetected
          .filter(w => !w.isNether && !w.isEnd)
          .sort((a, b) => a.path.length - b.path.length);
        const mainWorld = mains[0];

        if (!mainWorld) throw new Error(t("壓縮包中找不到 level.dat，請確保是有效的存檔。"));

        // Step 4: 執行重組移動
        message.loading({ content: t("正在重組伺服器目錄..."), key: msgKey });

        // 先清理舊目錄
        await executeDelete({
          params: { daemonId: props.daemonId, uuid: props.instanceId },
          data: { targets: ["/world", "/world_nether", "/world_the_end"] }
        });

        // 搬運主世界 (建立 /world/)
        await executeMove({
          params: { daemonId: props.daemonId, uuid: props.instanceId },
          data: { targets: [[mainWorld.path, "/world/"]] }
        });

        // 抽離並對齊維度
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

        // Step 5: 清理垃圾
        await executeDelete({
          params: { daemonId: props.daemonId, uuid: props.instanceId },
          data: { targets: ["/" + file.name, "/" + tempDirName] }
        });

        message.success({ content: t("地圖智慧對齊完成！"), key: msgKey });
        open.value = false;
      } catch (err: any) {
        message.error({ content: t("操作失敗: ") + err.message, key: msgKey });
      } finally {
        uploading.value = false;
      }
    }
  });
};

defineExpose({ openDialog });
</script>

<template>
  <a-modal
    v-model:open="open"
    :title="t('地圖智慧替換')"
    :footer="null"
    centered
    :mask-closable="!uploading"
    width="480px"
  >
    <div class="p-4">
      <div v-if="!uploading">
        <a-upload-dragger
          :show-upload-list="false"
          :before-upload="(file: any) => { handleMapReplace(file); return false; }"
        >
          <p class="ant-upload-drag-icon">
            <CloudUploadOutlined style="color: #1890ff" />
          </p>
          <p class="ant-upload-text">點擊或拖拽地圖壓縮包至此</p>
          <p class="ant-upload-hint">支持全深度自動識別，將自動對齊主世界與維度結構</p>
        </a-upload-dragger>
      </div>

      <div v-else class="py-10 text-center">
        <div class="mb-4 flex items-center justify-center">
          <LoadingOutlined v-if="uploadData.current" spin style="font-size: 24px" />
          <InteractionOutlined v-else spin style="font-size: 24px; color: #52c41a" />
          <span class="ml-3 text-lg font-medium">
            {{ uploadData.current ? t('正在傳輸數據...') : t('分析與對齊結構中...') }}
          </span>
        </div>
        <div v-if="uploadData.current" class="px-6">
          <a-progress :percent="progress" status="active" />
        </div>
      </div>
    </div>
  </a-modal>
</template>

<style scoped>
.ml-2 { margin-left: 8px; }
:deep(.ant-upload-drag) { border-radius: 12px; }
</style>
