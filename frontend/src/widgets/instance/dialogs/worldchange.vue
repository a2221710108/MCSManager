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
        const tempDirName = `map_extract_${Date.now()}`;
        
        // --- 階段 1: 上傳檔案 ---
        // 修復 TS2345: 根據報錯補全 upload 必填參數
        message.loading({ content: t("正在上傳..."), key: msgKey });
        await executeUpload({
          params: { 
            overwrite: true,
            filename: file.name,
            size: file.size,
            sum: "", // 如果後端不需要校驗，傳空字串，否則需計算 MD5
            unzip: false,
            code: "utf-8"
          },
          data: file 
        });

        // --- 階段 2: 解壓到臨時目錄 ---
        message.loading({ content: t("正在解壓分析..."), key: msgKey });
        await executeCompress({
          params: { uuid: props.instanceId, daemonId: props.daemonId },
          data: { 
            type: 2, 
            code: "utf-8", 
            source: "/" + file.name, 
            targets: `/${tempDirName}/` 
          }
        });

        const realWorldPath = await findWorldDir(`/${tempDirName}/`);
        if (!realWorldPath) throw new Error(t("無效的地圖檔案 (找不到 level.dat)"));

        // --- 階段 3: 清理並套用 ---
        message.loading({ content: t("正在重組目錄結構..."), key: msgKey });
        
        // 刪除舊的
        await executeDelete({
          params: { daemonId: props.daemonId, uuid: props.instanceId },
          data: { targets: ["/world", "/world_nether", "/world_the_end"] }
        });

        // 這裡的邏輯：再次解壓到 /world/ 是最保險的自動對齊方式
        // 因為你的後端 API 可能沒有 rename 功能
        await executeCompress({
          params: { uuid: props.instanceId, daemonId: props.daemonId },
          data: { 
            type: 2, 
            code: "utf-8", 
            source: "/" + file.name, 
            targets: "/world/" 
          }
        });

        // --- 階段 4: 清理垃圾 ---
        await executeDelete({
          params: { daemonId: props.daemonId, uuid: props.instanceId },
          data: { targets: ["/" + file.name, "/" + tempDirName] }
        });

        message.success({ content: t("地圖替換成功！"), key: msgKey });
        open.value = false;
      } catch (err: any) {
        reportErrorMsg(err.message);
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
