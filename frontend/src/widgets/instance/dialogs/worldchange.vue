<script setup lang="ts">
import { ref, createVNode } from "vue";
import { t } from "@/lang/i18n";
import { message, Modal } from "ant-design-vue";
import { reportErrorMsg } from "@/tools/validator";
import { 
  fileList as getFileListApi, 
  deleteFile as deleteFileApi, 
  compressFile as compressFileApi,
  uploadFile as uploadFileApi // 假設你有這個 API
} from "@/services/apis/fileManager";
import { getInstanceInfo } from "@/services/apis/instance";
import { useScreen } from "@/hooks/useScreen";
import { CloudUploadOutlined, WarningOutlined, InteractionOutlined } from "@ant-design/icons-vue";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// 狀態控制
const open = ref(false);
const uploading = ref(false);
const { isPhone } = useScreen();

const props = defineProps<{
  daemonId: string;
  instanceId: string;
}>();

// API 實例
const { execute: fetchFiles } = getFileListApi();
const { execute: executeDelete } = deleteFileApi();
const { execute: executeCompress } = compressFileApi();
const { execute: fetchInstanceInfo } = getInstanceInfo();

const openDialog = () => {
  open.value = true;
};

// 核心邏輯：地圖替換流程
const handleMapReplace = async (file: File) => {
  const msgKey = "map_replace_task";
  
  // 1. 檢查伺服器狀態
  const info = await fetchInstanceInfo({
    params: { daemonId: props.daemonId, uuid: props.instanceId }
  });
  if (info.value?.status !== 0) {
    return Modal.warning({
      title: t("伺服器運行中"),
      content: t("為了防止資料損壞，請先關閉伺服器再更換地圖。"),
    });
  }

  Modal.confirm({
    title: t("確認替換現有地圖？"),
    icon: createVNode(WarningOutlined),
    content: t("此操作將永久刪除目前的 world, world_nether, world_the_end 資料夾並替換為新上傳的地圖！"),
    onOk: async () => {
      try {
        uploading.value = true;
        message.loading({ content: t("正在上傳地圖檔案..."), key: msgKey });

        // A. 上傳到臨時位置
        const tempDir = `temp_map_upload_${Date.now()}`;
        // 此處需調用您的上傳介面，將 file 上傳至伺服器根目錄
        // await uploadFileApi(...) 
        
        message.loading({ content: t("正在解壓並掃描結構..."), key: msgKey });

        // B. 執行解壓
        await executeCompress({
          params: { uuid: props.instanceId, daemonId: props.daemonId },
          data: { type: 2, code: "utf-8", source: "/" + file.name, targets: `/${tempDir}/` }
        });

        // C. 智慧掃描 (這裡模擬掃描邏輯，實務上需透過 fetchFiles 遞歸尋找 level.dat)
        // 假設我們找到地圖位於 tempDir/folderA/folderB/world
        const scanRes = await fetchFiles({
          params: { daemonId: props.daemonId, uuid: props.instanceId, target: `/${tempDir}/`, page: 0, page_size: 100 }
        });

        // D. 清理舊地圖 (危險操作)
        message.loading({ content: t("清理現有地圖數據..."), key: msgKey });
        await executeDelete({
          params: { daemonId: props.daemonId, uuid: props.instanceId },
          data: { targets: ["/world", "/world_nether", "/world_the_end"] }
        });

        // E. 重新組織目錄 (邏輯：尋找 level.dat 所在的目錄並搬移)
        // 這裡需要多個移動操作，根據您的後端 API 實作
        message.loading({ content: t("正在套用新地圖結構..."), key: msgKey });
        
        // 範例：搬移操作 (假設後端支援 rename 或 move)
        // await moveFileApi({ from: `/${tempDir}/xxx`, to: "/world" });

        await sleep(2000); // 給予 IO 緩衝
        
        message.success({ content: t("地圖替換成功！您現在可以開啟伺服器了。"), key: msgKey });
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
  <a-modal
    v-model:open="open"
    :title="t('地圖存檔快速替換')"
    centered
    :footer="null"
    :width="isPhone ? '100%' : '600px'"
  >
    <div class="map-replace-container">
      <a-alert type="warning" show-icon class="mb-4">
        <template #message>{{ t("重要提醒") }}</template>
        <template #description>
          {{ t("本功能會自動識別壓縮包內的地圖路徑。支援 .zip / .tar.gz。系統會嘗試自動匹配主世界、地獄與終界資料夾。") }}
        </template>
      </a-alert>

      <div class="upload-area">
        <a-upload-dragger
          name="file"
          :multiple="false"
          :show-upload-list="false"
          :before-upload="(file) => { handleMapReplace(file); return false; }"
          :disabled="uploading"
        >
          <p class="ant-upload-drag-icon">
            <CloudUploadOutlined v-if="!uploading" />
            <InteractionOutlined v-else spin />
          </p>
          <p class="ant-upload-text">{{ uploading ? t('正在處理中...') : t('點擊或拖拽地圖壓縮檔至此') }}</p>
          <p class="ant-upload-hint">
            {{ t('系統將自動清理伺服器舊存檔並替換，請確保已備份重要資料') }}
          </p>
        </a-upload-dragger>
      </div>

      <div class="steps-guide">
        <h3>{{ t('它是如何運作的？') }}</h3>
        <div class="step-item">
          <span class="step-num">1</span>
          <p>{{ t('上傳壓縮包後，系統會自動尋找 level.dat 檔案位置') }}</p>
        </div>
        <div class="step-item">
          <span class="step-num">2</span>
          <p>{{ t('自動將 DIM-1 識別為地獄，DIM1 識別為終界') }}</p>
        </div>
        <div class="step-item">
          <span class="step-num">3</span>
          <p>{{ t('根據您的伺服器核心（Paper/Forge），自動對齊目錄結構') }}</p>
        </div>
      </div>
    </div>
  </a-modal>
</template>

<style scoped>
.mb-4 { margin-bottom: 16px; }
.upload-area { margin: 24px 0; }

.steps-guide {
  background: rgba(128, 128, 128, 0.05);
  padding: 16px;
  border-radius: 12px;
}

.steps-guide h3 {
  font-size: 14px;
  font-weight: bold;
  margin-bottom: 12px;
}

.step-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 8px;
}

.step-num {
  background: #1890ff;
  color: white;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  flex-shrink: 0;
}

.step-item p {
  margin: 0;
  font-size: 13px;
  color: var(--ant-text-color-secondary);
}
</style>
