<script setup lang="ts">
import { ref, reactive, createVNode, computed } from "vue";
import { t } from "@/lang/i18n";
import { message, Modal } from "ant-design-vue";
import { 
  CloudDownloadOutlined, 
  SettingOutlined, 
  CodeOutlined,
  QuestionCircleOutlined,
  InfoCircleOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined
} from "@ant-design/icons-vue";
import { installCurseForgePack } from "@/services/apis/instance";
import { fileList, deleteFile } from "@/services/apis/fileManager";

const props = defineProps<{
  daemonId: string;
  instanceId: string;
  instanceInfo: any; 
}>();

const isVisible = ref(false);
const confirmLoading = ref(false);
const isCleaning = ref(false);

// 新增狀態控制
const agreeClean = ref(false);
const hasCleaned = ref(false);

const form = reactive({
  projectId: "",
  versionId: "latest",
  apiKey: localStorage.getItem("mcs_cf_api_key") || ""
});

const { execute: fetchFileList } = fileList();
const { execute: executeDelete } = deleteFile();

const openDialog = () => {
  if (props.instanceInfo.status !== 0) {
    return message.error(t("請先關閉伺服器"));
  }
  // 每次打開重置清空狀態
  hasCleaned.value = false;
  agreeClean.value = false;
  isVisible.value = true;
};

/**
 * 執行清空伺服器邏輯
 */
const handleCleanServer = async () => {
  Modal.confirm({
    title: t("確定要清空伺服器嗎？"),
    icon: createVNode(ExclamationCircleOutlined, { style: 'color: #ff4d4f' }),
    content: t("這將刪除當前實例目錄下的所有檔案（LazyCloud_backup 除外），此操作不可撤銷！"),
    okText: t("確定清空"),
    okType: "danger",
    onOk: async () => {
      try {
        isCleaning.value = true;
        // 1. 獲取檔案列表
        const res = await fetchFileList({
          params: { daemonId: props.daemonId, uuid: props.instanceId, target: "/" }
        });
        
        const allItems = res.value?.items || [];
        // 2. 篩選掉 LazyCloud_backup
        const targets = allItems
          .filter((item: any) => item.name !== "LazyCloud_backup")
          .map((item: any) => "/" + item.name);

        if (targets.length > 0) {
          await executeDelete({
            params: { daemonId: props.daemonId, uuid: props.instanceId },
            data: { targets }
          });
        }
        
        message.success(t("伺服器已清空（備份資料夾已保留）"));
        hasCleaned.value = true;
      } catch (err: any) {
        message.error(t("清空失敗: ") + err.message);
      } finally {
        isCleaning.value = false;
      }
    }
  });
};

const handleInstall = async () => {
  if (!form.projectId || !form.apiKey) {
    return message.warning(t("請完整填寫 Project ID 與 API Key"));
  }

  Modal.confirm({
    title: t("確認安裝"),
    content: t("準備開始自動化安裝流程，這可能需要幾分鐘時間。"),
    onOk: async () => {
      try {
        confirmLoading.value = true;
        props.instanceInfo.status = 2; 

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

        message.success(t("安裝任務已啟動"));
        isVisible.value = false;
      } catch (err: any) {
        props.instanceInfo.status = 0;
        Modal.error({ title: t("啟動失敗"), content: err.message });
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
    :title="t('CurseForge ModPack 自動安裝')"
    :footer="null"
    :mask-closable="false"
    destroy-on-close
    width="550px"
  >
    <div class="cf-install-content">
      <div class="clean-section mb-6 p-4 bg-red-50 rounded-lg border border-red-100">
        <div class="flex justify-between items-start mb-3">
          <div>
            <h4 class="text-red-600 font-bold mb-1"><DeleteOutlined /> {{ t('第一步：環境清算') }}</h4>
            <p class="text-xs text-red-500">{{ t('安裝 ModPack 前建議清空舊檔案以防止衝突。') }}</p>
          </div>
          <a-tag v-if="hasCleaned" color="success">{{ t('已完成清空') }}</a-tag>
        </div>
        
        <div class="flex flex-col gap-3">
          <a-checkbox v-model:checked="agreeClean" :disabled="hasCleaned">
            <span class="text-xs">{{ t('我同意清空所有檔案（排除 LazyCloud_backup）') }}</span>
          </a-checkbox>
          <a-button 
            danger 
            ghost 
            size="small" 
            :disabled="!agreeClean || hasCleaned" 
            :loading="isCleaning"
            @click="handleCleanServer"
          >
            {{ hasCleaned ? t('伺服器已處於乾淨狀態') : t('立即執行清空伺服器') }}
          </a-button>
        </div>
      </div>

      <div :class="{ 'opacity-40 pointer-events-none': !hasCleaned }">
        <h4 class="font-bold mb-4 ml-1"><SettingOutlined /> {{ t('第二步：ModPack 配置') }}</h4>
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

          <div class="mt-6 flex justify-end gap-2">
            <a-button @click="isVisible = false">{{ t('取消') }}</a-button>
            <a-button 
              type="primary" 
              :loading="confirmLoading" 
              :disabled="!hasCleaned"
              @click="handleInstall"
              class="install-btn"
            >
              <template #icon><CloudDownloadOutlined /></template>
              {{ hasCleaned ? t('開始安裝任務') : t('請先執行環境清算') }}
            </a-button>
          </div>
        </a-form>
      </div>
    </div>
  </a-modal>
</template>

<style scoped>
.bg-red-50 { background-color: #fff1f0; }
.border-red-100 { border-color: #ffa39e; }
.mb-6 { margin-bottom: 1.5rem; }
.opacity-40 { opacity: 0.4; transition: opacity 0.3s; }
.pointer-events-none { pointer-events: none; }
/* 其餘樣式保持... */
.install-btn { background-color: #1890ff; border-radius: 4px; color: white; }
.install-btn[disabled] { background-color: #f5f5f5; color: rgba(0, 0, 0, 0.25); border-color: #d9d9d9; }
</style>
