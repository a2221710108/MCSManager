<script setup lang="ts">
import { ref, createVNode } from "vue";
import { t } from "@/lang/i18n";
import { message, Modal } from "ant-design-vue";
import { reportErrorMsg } from "@/tools/validator";
import { 
  fileList as getFileListApi, 
  deleteFile as deleteFileApi, 
  compressFile as compressFileApi,
  uploadFile as uploadFileApi 
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
  
  // 檢查是否有 level.dat
  if (items.some((item: any) => item.name === "level.dat")) {
    return targetPath;
  }

  // 修復 TS2339: 使用 type === 1 判斷是否為目錄 (通常 0 是檔案，1 是目錄)
  for (const item of items) {
    if (item.type === 1) { 
      const found = await findWorldDir(`${targetPath}${item.name}/`);
      if (found) return found;
    }
  }
  return null;
};

const handleMapReplace = async (file: File) => {
  const msgKey = "map_replace_task";
  
  // 獲取實例信息
  const info = await fetchInstanceInfo({ params: { daemonId: props.daemonId, uuid: props.instanceId } });
  if (info.value?.status !== 0) {
    return Modal.warning({ title: t("無法替換"), content: t("請先關閉伺服器。") });
  }

  Modal.confirm({
    title: t("確認替換地圖？"),
    icon: createVNode(WarningOutlined),
    content: t("這將清空舊地圖並套用新上傳的存檔。"),
    onOk: async () => {
      try {
        uploading.value = true;
        
        // --- 修正後的上傳階段 ---
        message.loading({ content: t("正在上傳..."), key: msgKey });
        
        await executeUpload({
          // 這裡合併了所有可能的參數：
          // 1. 你的 API 可能需要 daemonId/uuid 來構建 URL (解決 url is empty)
          // 2. 你的 TS 檢查需要 filename/size 等
          params: { 
            daemonId: props.daemonId, // 嘗試補回這兩個，通常是拼接 URL 用的
            uuid: props.instanceId,
            overwrite: true,
            filename: file.name,
            size: file.size,
            sum: "", 
            unzip: false,
            code: "utf-8"
          },
          data: file 
        });

        // --- 階段 2: 解壓分析 ---
        message.loading({ content: t("正在解壓分析結構..."), key: msgKey });
        const tempDirName = `map_extract_${Date.now()}`;
        await executeCompress({
          params: { uuid: props.instanceId, daemonId: props.daemonId },
          data: { 
            type: 2, 
            code: "utf-8", 
            source: "/" + file.name, 
            targets: `/${tempDirName}/` 
          }
        });

        // 遞歸尋找 level.dat
        const realWorldPath = await findWorldDir(`/${tempDirName}/`);
        if (!realWorldPath) throw new Error(t("無效的地圖檔案 (找不到 level.dat)"));

        // --- 階段 3: 清理並套用 ---
        message.loading({ content: t("正在套用新存檔路徑..."), key: msgKey });
        
        // 刪除舊地圖資料夾
        await executeDelete({
          params: { daemonId: props.daemonId, uuid: props.instanceId },
          data: { targets: ["/world", "/world_nether", "/world_the_end"] }
        });

        // 核心邏輯：將上傳的壓縮包直接解壓到 /world/ 目錄
        // 這能確保無論原壓縮包結構如何，解壓後都能在 /world/ 下找到 level.dat
        await executeCompress({
          params: { uuid: props.instanceId, daemonId: props.daemonId },
          data: { 
            type: 2, 
            code: "utf-8", 
            source: "/" + file.name, 
            targets: "/world/" 
          }
        });

        // --- 階段 4: 清理臨時檔案 ---
        await executeDelete({
          params: { daemonId: props.daemonId, uuid: props.instanceId },
          data: { targets: ["/" + file.name, "/" + tempDirName] }
        });

        message.success({ content: t("地圖替換成功！"), key: msgKey });
        open.value = false;
      } catch (err: any) {
        // 詳細捕獲錯誤，看看是不是 url 依舊為空
        console.error("Upload Error Details:", err);
        reportErrorMsg(err.message || "Upload Failed");
      } finally {
        uploading.value = false;
      }
    }
  });
};

defineExpose({ openDialog });
</script>

<template>
  <a-modal v-model:open="open" :title="t('地圖存檔快速替換')" :footer="null" :width="isPhone ? '100%' : 500">
    <div class="upload-wrapper">
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
        <p class="ant-upload-text">{{ uploading ? t('處理中...') : t('拖入地圖壓縮檔 (.zip / .tar.gz)') }}</p>
      </a-upload-dragger>
      
      <div class="info-tips">
        <p>● {{ t('自動尋找 level.dat 並對齊路徑') }}</p>
        <p>● {{ t('建議上傳前先備份當前地圖') }}</p>
      </div>
    </div>
  </a-modal>
</template>

<style scoped>
.upload-wrapper { padding: 20px; }
.info-tips { margin-top: 16px; color: #666; font-size: 12px; }
</style>
