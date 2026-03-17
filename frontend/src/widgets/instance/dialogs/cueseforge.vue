<script setup lang="ts">
import { ref } from "vue";
import { t } from "@/lang/i18n";
import { message, Modal } from "ant-design-vue";
import {
  CloudDownloadOutlined,
  SettingOutlined,
  LoadingOutlined,
  QuestionCircleOutlined,
  CodeOutlined
} from "@ant-design/icons-vue";
import { request } from "@/services/protocol";

// 接收來自父組件的實例資訊
const props = defineProps<{
  daemonId: string;
  instanceId: string;
}>();

const open = ref(false);
const installing = ref(false);

// 表單數據設定
const form = ref({
  projectId: "",
  versionId: "latest",
  apiKey: localStorage.getItem("mcs_cf_api_key") || ""
});

// 開啟彈窗的方法
const openDialog = () => {
  open.value = true;
};

/**
 * 執行安裝請求
 */
const handleStartInstall = async () => {
  // 驗證輸入
  if (!form.value.projectId || !form.value.apiKey) {
    return message.error(t("請填寫 Project ID 與 API Key"));
  }

  // 儲存 API Key 到本地，方便下次使用
  localStorage.setItem("mcs_cf_api_key", form.value.apiKey);

  Modal.confirm({
    title: t("確認開始 CurseForge 自動安裝？"),
    content: t("系統將會下載整合包並覆蓋現有檔案。請確保伺服器已關閉，且重要數據已備份。"),
    okText: t("開始安裝"),
    cancelText: t("取消"),
    onOk: async () => {
      try {
        installing.value = true;

        // 調用你在 Instance_router.ts 中註冊的事件
        await request({
          event: "instance/curseforge_install",
          data: {
            instanceUuid: props.instanceId,
            parameter: {
              projectId: form.value.projectId,
              versionId: form.value.versionId,
              apiKey: form.value.apiKey
            }
          }
        });

        message.success(t("安裝任務已在後端啟動"));
        // 啟動後關閉視窗，引導使用者查看控制台日誌
        setTimeout(() => {
          open.value = false;
          installing.value = false;
        }, 1500);
      } catch (err: any) {
        installing.value = false;
        Modal.error({
          title: t("啟動失敗"),
          content: err.message || t("後端拒絕了請求，請檢查 API Key 是否正確。")
        });
      }
    }
  });
};

// 暴露方法給父組件
defineExpose({ openDialog });
</script>

<template>
  <a-modal
    v-model:visible="open"
    :title="t('CurseForge 整合包一鍵安裝')"
    :footer="null"
    :mask-closable="false"
    destroy-on-close
    width="500px"
  >
    <div class="cf-container">
      <div class="header-banner">
        <CloudDownloadOutlined class="icon-main" />
        <div class="header-text">
          <div class="title">{{ t('自動化整合包部署') }}</div>
          <div class="subtitle">{{ t('支援自動解析 Manifest 與 Overrides') }}</div>
        </div>
      </div>

      <a-form layout="vertical" class="mt-4">
        <a-form-item>
          <template #label>
            <span>
              CurseForge API Key
              <a-tooltip title="前往 CurseForge Console 申請 Eternal API Key">
                <QuestionCircleOutlined class="ml-1 text-gray-400" />
              </a-tooltip>
            </span>
          </template>
          <a-input-password v-model:value="form.apiKey" :placeholder="t('輸入你的 API Key')">
            <template #prefix><SettingOutlined class="text-gray-300" /></template>
          </a-input-password>
        </a-form-item>

        <div class="flex-row">
          <a-form-item :label="t('Project ID (Modpack)')" class="flex-1">
            <a-input v-model:value="form.projectId" placeholder="285682">
              <template #prefix><CodeOutlined class="text-gray-300" /></template>
            </a-input>
          </a-form-item>

          <a-form-item :label="t('File ID (選填)')" class="flex-1">
            <a-input v-model:value="form.versionId" placeholder="latest" />
          </a-form-item>
        </div>

        <div class="info-card">
          <div class="text-xs text-blue-600 mb-1 font-bold">● {{ t('運作流程') }}</div>
          <p class="text-xs text-gray-500 m-0">
            1. 下載主壓縮包 -> 2. 解壓檔案 -> 3. 解析 Manifest 下載依賴 Mods -> 4. 處理 Overrides -> 5. 清理臨時檔。
          </p>
        </div>

        <div class="footer-actions">
          <a-button @click="open = false" :disabled="installing">{{ t('取消') }}</a-button>
          <a-button
            type="primary"
            :loading="installing"
            @click="handleStartInstall"
            class="install-btn"
          >
            <template #icon v-if="!installing"><CloudDownloadOutlined /></template>
            {{ installing ? t('啟動中...') : t('開始安裝') }}
          </a-button>
        </div>
      </a-form>
    </div>
  </a-modal>
</template>

<style scoped>
.cf-container {
  padding: 10px 4px;
}

.header-banner {
  display: flex;
  align-items: center;
  background: linear-gradient(135deg, #f0f7ff 0%, #e6f7ff 100%);
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 20px;
}

.icon-main {
  font-size: 32px;
  color: #1890ff;
  margin-right: 16px;
}

.header-text .title {
  font-size: 16px;
  font-weight: bold;
  color: #003a8c;
}

.header-text .subtitle {
  font-size: 12px;
  color: #40a9ff;
}

.flex-row {
  display: flex;
  gap: 16px;
}

.flex-1 {
  flex: 1;
}

.info-card {
  background: #fafafa;
  border: 1px dashed #d9d9d9;
  padding: 12px;
  border-radius: 6px;
  margin: 10px 0 24px 0;
}

.footer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.install-btn {
  min-width: 120px;
}

.ml-1 {
  margin-left: 4px;
}
</style>
