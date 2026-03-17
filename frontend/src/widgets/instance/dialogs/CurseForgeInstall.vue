<script setup lang="ts">
import { ref, reactive, createVNode, computed } from "vue";
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
  // 核心修正 1：傳入實例狀態 (0 為停止, 1 為運行, 2 為維護/忙碌)
  instanceStatus: number; 
}>();

const isVisible = ref(false);
const confirmLoading = ref(false);

// 表單數據模型
const form = reactive({
  projectId: "",
  versionId: "latest",
  apiKey: localStorage.getItem("mcs_cf_api_key") || ""
});

// 核心修正 2：開啟彈窗前檢查狀態
const openDialog = () => {
  // 只有狀態為 0 (停止) 才能打開
  if (props.instanceStatus !== 0) {
    return message.error(t("實例必須處於『停止』狀態才能進行安裝操作！"));
  }
  isVisible.value = true;
};

// 執行安裝邏輯
const handleInstall = async () => {
  if (!form.projectId || !form.apiKey) {
    return message.warning(t("請完整填寫 Project ID 與 API Key"));
  }

  // 再次檢查狀態，防止 UI 滯後導致誤觸
  if (props.instanceStatus !== 0) {
    return message.error(t("實例狀態已變更，請確保其處於停止狀態。"));
  }

  localStorage.setItem("mcs_cf_api_key", form.apiKey);

  Modal.confirm({
    title: t("確認部署此整合包？"),
    icon: createVNode(QuestionCircleOutlined, { style: 'color: #1890ff' }),
    content: t("系統將會執行自動化安裝。執行期間實例將進入維護狀態且無法啟動。"),
    okText: t("立即開始"),
    cancelText: t("取消"),
    onOk: async () => {
      // 核心修正 3：防止重複點擊
      if (confirmLoading.value) return; 
      
      try {
        confirmLoading.value = true;
        
        await installCurseForgePack().execute({
          params: {
            daemonId: props.daemonId,
            uuid: props.instanceId,
          },
          data: {
            projectId: form.projectId,
            versionId: form.versionId,
            apiKey: form.apiKey
          }
        });

        message.success(t("安裝任務已啟動。"));
        // 成功發送請求後立即關閉 UI，防止用戶在後端切換狀態前再次點擊
        isVisible.value = false;
      } catch (err: any) {
        Modal.error({
          title: t("啟動失敗"),
          content: err.response?.data || err.message || t("發生未知錯誤")
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
       <a-badge-status v-if="instanceStatus !== 0" status="error" :text="t('注意：實例目前非停止狀態')" class="mb-2" />
       
       <a-alert type="info" show-icon class="mb-4">
        </a-alert>

      <a-form layout="vertical">
        <div class="mt-4 flex justify-end gap-2">
          <a-button @click="isVisible = false">{{ t('取消') }}</a-button>
          <a-button 
            type="primary" 
            :loading="confirmLoading" 
            :disabled="instanceStatus !== 0"
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
