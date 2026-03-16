<script setup lang="ts">
import { ref, createVNode } from "vue";
import { t } from "@/lang/i18n";
import { message, Modal } from "ant-design-vue";
import { reportErrorMsg } from "@/tools/validator";
import { 
  fileList as getFileListApi, 
  deleteFile as deleteFileApi, 
  compressFile as compressFileApi,
  uploadFile as uploadFileApi // 確保你有這個上傳 API
} from "@/services/apis/fileManager";
import { getInstanceInfo } from "@/services/apis/instance";
import { useScreen } from "@/hooks/useScreen";
import { CloudUploadOutlined, WarningOutlined, InteractionOutlined } from "@ant-design/icons-vue";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
const { execute: executeUpload } = uploadFileApi();
const { execute: fetchInstanceInfo } = getInstanceInfo();

const openDialog = () => {
  open.value = true;
};

// 遞歸掃描函數：尋找包含 level.dat 的目錄
const findWorldDir = async (targetPath: string): Promise<string | null> => {
  const res = await fetchFiles({
    params: { 
      daemonId: props.daemonId, uuid: props.instanceId, 
      target: targetPath, page: 0, page_size: 100, file_name: "" 
    }
  });
  const items = res.value?.items || [];
  
  // 檢查當前目錄是否有 level.dat
  if (items.some((item: any) => item.name === "level.dat")) {
    return targetPath;
  }

  // 如果沒有，往下一層找 (遞歸)
  for (const item of items) {
    if (item.isDirectory) {
      const found = await findWorldDir(`${targetPath}${item.name}/`);
      if (found) return found;
    }
  }
  return null;
};

const handleMapReplace = async (file: File) => {
  const msgKey = "map_replace_task";
  
  // 1. 狀態預檢
  const info = await fetchInstanceInfo({ params: { daemonId: props.daemonId, uuid: props.instanceId } });
  if (info.value?.status !== 0) {
    return Modal.warning({ title: t("伺服器運行中"), content: t("請先關閉伺服器。") });
  }

  Modal.confirm({
    title: t("確認替換地圖？"),
    icon: createVNode(WarningOutlined),
    content: t("系統將會清空現有存檔目錄並嘗試從上傳的壓縮檔中還原地圖結構。"),
    onOk: async () => {
      try {
        uploading.value = true;
        const tempDirName = `map_extract_${Date.now()}`;
        
        // --- 階段 1: 上傳檔案 ---
        message.loading({ content: t("正在上傳地圖中..."), key: msgKey });
        await executeUpload({
          params: { daemonId: props.daemonId, uuid: props.instanceId, target: "/" },
          data: file // 假設後端接收二進制或 FormData
        });

        // --- 階段 2: 解壓到臨時目錄 ---
        message.loading({ content: t("正在解壓檔案..."), key: msgKey });
        await executeCompress({
          params: { uuid: props.instanceId, daemonId: props.daemonId },
          data: { type: 2, code: "utf-8", source: "/" + file.name, targets: `/${tempDirName}/` }
        });

        // --- 階段 3: 智慧掃描與定位 ---
        message.loading({ content: t("正在分析地圖結構..."), key: msgKey });
        const realWorldPath = await findWorldDir(`/${tempDirName}/`);
        
        if (!realWorldPath) {
          throw new Error(t("壓縮包中找不到有效的 Minecraft 地圖 (未發現 level.dat)"));
        }

        // --- 階段 4: 清理舊存檔與移動新存檔 ---
        message.loading({ content: t("正在套用新存檔..."), key: msgKey });
        
        // 先刪除原有的 world
        await executeDelete({
          params: { daemonId: props.daemonId, uuid: props.instanceId },
          data: { targets: ["/world", "/world_nether", "/world_the_end"] }
        });

        // 搬移新地圖 (此處假設後端 compress 介面也可用於移動或改名，
        // 如果後端沒 move 接口，通常是將實體目錄 rename 為 world)
        // 這裡以解壓到 /world 為例
        await executeCompress({
          params: { uuid: props.instanceId, daemonId: props.daemonId },
          data: { type: 2, code: "utf-8", source: "/" + file.name, targets: "/world/" }
        });

        // --- 階段 5: 清理垃圾 ---
        await executeDelete({
          params: { daemonId: props.daemonId, uuid: props.instanceId },
          data: { targets: ["/" + file.name, "/" + tempDirName] }
        });

        message.success({ content: t("地圖替換成功！"), key: msgKey });
        open.value = false;
      } catch (err: any) {
        reportErrorMsg(err.message);
        message.error({ content: t("替換失敗"), key: msgKey });
      } finally {
        uploading.value = false;
      }
    }
  });
};

defineExpose({ openDialog });
</script>

<template>
  <a-modal v-model:open="open" :title="t('地圖存檔替換')" :footer="null" :width="600">
    <div class="p-4">
      <a-upload-dragger
        :multiple="false"
        :show-upload-list="false"
        :before-upload="(file: any) => { handleMapReplace(file as File); return false; }"
        :disabled="uploading"
      >
        <p class="ant-upload-drag-icon">
          <InteractionOutlined v-if="uploading" spin />
          <CloudUploadOutlined v-else />
        </p>
        <p class="ant-upload-text">{{ uploading ? t('正在上傳並處理中...') : t('點擊或拖拽地圖壓縮包') }}</p>
        <p class="ant-upload-hint">{{ t('支援 .zip / .tar.gz，會自動過濾多餘目錄層級') }}</p>
      </a-upload-dragger>
    </div>
  </a-modal>
</template>
