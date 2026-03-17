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

// 修正 1: 增加 instance 對象的傳入，以便直接修改其狀態
const props = defineProps<{
  daemonId: string;
  instanceId: string;
  instance: any; // 傳入完整的 instance 實體
}>();

const isVisible = ref(false);
const confirmLoading = ref(false);

const form = reactive({
  projectId: "",
  versionId: "latest",
  apiKey: localStorage.getItem("mcs_cf_api_key") || ""
});

// 修正 2: 開啟彈窗時檢查狀態，非停止狀態（0）不准打開
const openDialog = () => {
  if (props.instance.status !== 0) {
    return message.error(t("實例必須處於『停止』狀態才能進行安裝操作！"));
  }
  isVisible.value = true;
};

const handleInstall = async () => {
  if (!form.projectId || !form.apiKey) {
    return message.warning(t("請完整填寫 Project ID 與 API Key"));
  }

  // 再次檢查，防止 UI 滯後
  if (props.instance.status !== 0) {
    return message.error(t("實例目前並非停止狀態，無法啟動任務。"));
  }

  localStorage.setItem("mcs_cf_api_key", form.apiKey);

  Modal.confirm({
    title: t("確認部署此整合包？"),
    icon: createVNode(QuestionCircleOutlined, { style: 'color: #1890ff' }),
    content: t("系統將會下載、解壓縮並覆蓋實例檔案。執行期間實例將進入維護狀態。"),
    okText: t("立即開始"),
    cancelText: t("取消"),
    onOk: async () => {
      try {
        confirmLoading.value = true;
        
        // 修正 3: 點擊確認後，立刻在前端將狀態設為「忙碌/維護中」(2)
        // 這會讓 MCSM 的控制台按鈕立刻變灰，防止用戶點擊「開啟」
        props.instance.status = 2; 

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

        message.success(t("安裝任務已在後端啟動，實例已進入維護模式"));
        isVisible.value = false;
      } catch (err: any) {
        // 如果啟動失敗，將狀態撥回「停止」(0)
        props.instance.status = 0;
        Modal.error({
          title: t("啟動失敗"),
          content: err.message || t("請檢查 API Key 是否有效或網絡連接。")
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
      <a-alert type="warning" show-icon class="mb-4">
        <template #message>
          {{ t('注意') }}
        </template>
        <template #description>
          {{ t('點擊開始後，實例狀態將變更為「維護中」，在任務完成前無法啟動伺服器。') }}
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
/* 樣式保持不變 */
.cf-install-content { padding: 8px 0; }
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
  color: white;
}
</style>
