<script setup lang="ts">
import { ref, reactive, createVNode } from "vue";
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
  // 修正 TS2345: 接收父組件傳遞的實例狀態
  instanceStatus: number; 
}>();

const isVisible = ref(false);
const confirmLoading = ref(false);

const form = reactive({
  projectId: "",
  versionId: "latest",
  apiKey: localStorage.getItem("mcs_cf_api_key") || ""
});

const openDialog = () => {
  // 需求實現：非停止狀態不讓打開
  if (props.instanceStatus !== 0) {
    return message.error(t("實例必須處於『停止』狀態才能進行安裝操作！"));
  }
  isVisible.value = true;
};

const handleInstall = async () => {
  if (!form.projectId || !form.apiKey) {
    return message.warning(t("請完整填寫 Project ID 與 API Key"));
  }

  localStorage.setItem("mcs_cf_api_key", form.apiKey);

  Modal.confirm({
    title: t("確認部署此整合包？"),
    icon: createVNode(QuestionCircleOutlined, { style: 'color: #1890ff' }),
    content: t("系統將會執行自動化安裝。執行期間實例將進入維護狀態。"),
    okText: t("立即開始"),
    cancelText: t("取消"),
    onOk: async () => {
      try {
        confirmLoading.value = true;
        
        // 修正 TS2345: 補齊 params 中的 task_name
        await installCurseForgePack().execute({
          params: {
            daemonId: props.daemonId,
            uuid: props.instanceId,
            task_name: "curseforge_install" 
          },
          data: {
            projectId: form.projectId,
            versionId: form.versionId,
            apiKey: form.apiKey
          }
        });

        message.success(t("安裝任務已啟動，實例已進入維護模式。"));
        isVisible.value = false;
      } catch (err: any) {
        Modal.error({
          title: t("啟動失敗"),
          content: err.response?.data || err.message || t("請檢查網路連接。")
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
        <template #message>{{ t('自動化流程說明') }}</template>
        <template #description>
          1. 解析 Manifest 2. 下載 Mod 3. 處理 Overrides。
        </template>
      </a-alert>

      <a-form layout="vertical">
        <a-form-item :label="t('CurseForge API Key')">
          <a-input-password v-model:value="form.apiKey" placeholder="Eternal API Key">
            <template #prefix><SettingOutlined style="color: rgba(0,0,0,.25)" /></template>
          </a-input-password>
        </a-form-item>

        <a-row :gutter="16">
          <a-col :span="14">
            <a-form-item :label="t('Project ID')">
              <a-input v-model:value="form.projectId" placeholder="285682">
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
.mb-4 { margin-bottom: 1rem; }
.mt-4 { margin-top: 1rem; }
.flex { display: flex; }
.justify-end { justify-content: flex-end; }
.gap-2 { gap: 0.5rem; }
.install-btn { background-color: #1890ff; border-radius: 4px; color: white; }
</style>
