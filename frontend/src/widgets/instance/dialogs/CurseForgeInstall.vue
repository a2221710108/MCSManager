<script setup lang="ts">
import { ref, reactive, createVNode } from "vue"; // 加入 createVNode
import { t } from "@/lang/i18n";
import { message, Modal } from "ant-design-vue";
import { 
  CloudDownloadOutlined, 
  SettingOutlined, 
  CodeOutlined,
  QuestionCircleOutlined,
  InfoCircleOutlined
} from "@ant-design/icons-vue";
import { installCurseForgePack } from "@/services/apis/instance";

const props = defineProps<{
  daemonId: string;
  instanceId: string;
}>();

const isVisible = ref(false);
const confirmLoading = ref(false);

// 表單數據模型
const form = reactive({
  projectId: "",
  versionId: "latest",
  apiKey: localStorage.getItem("mcs_cf_api_key") || ""
});

// 開啟彈窗
const openDialog = () => {
  isVisible.value = true;
};

// 執行安裝邏輯
const handleInstall = async () => {
  // 基礎驗證
  if (!form.projectId || !form.apiKey) {
    return message.warning(t("請完整填寫 Project ID 與 API Key"));
  }

  // 記住 API Key 方便下次使用
  localStorage.setItem("mcs_cf_api_key", form.apiKey);

  Modal.confirm({
    title: t("確認部署此整合包？"),
    icon: createVNode(QuestionCircleOutlined, { style: 'color: #1890ff' }),
    content: t("系統將會下載、解壓縮並覆蓋實例檔案。請確保伺服器目前處於關閉狀態。"),
    okText: t("立即開始"),
    cancelText: t("取消"),
    onOk: async () => {
      try {
        confirmLoading.value = true;
        
        await installCurseForgePack().execute({
          params: {
            daemonId: props.daemonId,
            uuid: props.instanceId
          },
          data: {
            projectId: form.projectId,
            versionId: form.versionId,
            apiKey: form.apiKey
          }
        });

        message.success(t("安裝任務已在後端啟動，請前往控制台查看詳細進度"));
        isVisible.value = false;
      } catch (err: any) {
        Modal.error({
          title: t("啟動失敗"),
          content: err.message || t("請檢查 API Key 是否有效或網路連接。")
        });
      } finally {
        confirmLoading.value = false;
      }
    }
  });
};

defineExpose({ openDialog });
</script>

<template>
  <a-modal
    v-model:open="isVisible"
    :title="t('CurseForge 整合包自動化部署')"
    :confirm-loading="confirmLoading"
    :footer="null"
    :mask-closable="false"
    destroy-on-close
    width="550px"
  >
    <div class="cf-install-content">
      <a-alert type="info" show-icon class="mb-4">
        <template #message>
          {{ t('自動化流程說明') }}
        </template>
        <template #description>
          1. 解析 Manifest 檔案 2. 下載所有相依 Mod 3. 處理 Overrides 覆蓋。
        </template>
      </a-alert>

      <a-form layout="vertical">
        <a-form-item :label="t('CurseForge API Key')">
          <template #extra>
            <span class="text-xs text-gray-400">
              <InfoCircleOutlined /> {{ t('請使用 CurseForge Console 申請的 Eternal API Key') }}
            </span>
          </template>
          <a-input-password v-model:value="form.apiKey" placeholder="$2a$10$...">
            <template #prefix><SettingOutlined style="color: rgba(0,0,0,.25)" /></template>
          </a-input-password>
        </a-form-item>

        <a-row :gutter="16">
          <a-col :span="14">
            <a-form-item :label="t('Project ID')">
              <a-input v-model:value="form.projectId" placeholder="例如: 285682">
                <template #prefix><CodeOutlined style="color: rgba(0,0,0,.25)" /></template>
              </a-input>
            </a-form-item>
          </a-col>
          
          <a-col :span="10">
            <a-form-item :label="t('File ID (選填)')">
              <a-input v-model:value="form.versionId" placeholder="latest" />
            </a-form-item>
          </a-col>
        </a-row>

        <div class="mt-4 flex justify-end gap-2">
          <a-button @click="isVisible = false">{{ t('取消') }}</a-button>
          <a-button 
            type="primary" 
            :loading="confirmLoading" 
            @click="handleInstall"
            class="install-btn"
          >
            <template #icon><CloudDownloadOutlined /></template>
            {{ t('開始安裝任務') }}
          </a-button>
        </div>
      </a-form>
    </div>
  </a-modal>
</template>

<style scoped>
.cf-install-content {
  padding: 8px 0;
}
.mb-4 { margin-bottom: 1rem; }
.mt-4 { margin-top: 1rem; }
.flex { display: flex; }
.justify-end { justify-content: flex-end; }
.gap-2 { gap: 0.5rem; }
.text-xs { font-size: 0.75rem; }
.text-gray-400 { color: #9ca3af; }
.install-btn {
  background-color: #1890ff;
  border-radius: 4px;
}
</style>
