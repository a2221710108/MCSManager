<script setup lang="ts">
import { ref, reactive, createVNode } from "vue";
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
    content: t("這將刪除您的所有檔案，此操作不可撤銷！"),
    okText: t("確定清空"),
    okType: "danger",
    onOk: async () => {
      try {
        isCleaning.value = true;
        
        // 修正 TS2345: 補齊所有必需的 params
        const res = await fetchFileList({
          params: { 
            daemonId: props.daemonId, 
            uuid: props.instanceId, 
            target: "/",
            page: 0,           // 補齊參數
            page_size: 100,   // 補齊參數，設置較大以確保獲取所有檔案
            file_name: ""      // 補齊參數
          }
        });
        
        const allItems = res.value?.items || [];
        // 篩選掉備份資料夾
        const targets = allItems
          .filter((item: any) => item.name !== "LazyCloud_backup")
          .map((item: any) => "/" + item.name);

        if (targets.length > 0) {
          await executeDelete({
            params: { daemonId: props.daemonId, uuid: props.instanceId },
            data: { targets }
          });
        }
        
        message.success(t("伺服器已清空"));
        hasCleaned.value = true;
      } catch (err: any) {
        message.error(t("清空失敗: ") + (err.message || "Unknown Error"));
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
        Modal.error({ title: t("安裝任務啟動失敗"), content: err.message });
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
    centered
    :title="t('CurseForge Modpack 自動安裝')"
    :footer="null"
    :mask-closable="false"
    destroy-on-close
    :width="520"
  >
    <div class="install-container">
      <div class="step-card danger-zone">
        <div class="card-header">
          <div class="header-content">
            <h4 class="step-title danger">
              <delete-outlined /> {{ t('第一步：環境清理') }}
            </h4>
            <p class="step-desc">
              {{ t('請注意：為防止錯誤，僅支持安裝有官方 Server Pack 的 Modpack！') }}
            </p>
          </div>
          <transition name="fade">
            <a-tag v-if="hasCleaned" color="success" class="status-tag">
              <check-circle-outlined /> {{ t('已完成') }}
            </a-tag>
          </transition>
        </div>

        <div class="card-action">
          <a-checkbox v-model:checked="agreeClean" :disabled="hasCleaned" class="custom-checkbox">
            <span class="checkbox-text">{{ t('我同意清空所有檔案') }}</span>
          </a-checkbox>
          <a-button 
            danger 
            :block="true"
            :loading="isCleaning"
            :disabled="!agreeClean || hasCleaned"
            class="action-btn"
            @click="handleCleanServer"
          >
            {{ hasCleaned ? t('伺服器已處於乾淨狀態') : t('立即執行環境清空') }}
          </a-button>
        </div>
      </div>

      <div class="step-card config-zone" :class="{ 'is-locked': !hasCleaned }">
        <h4 class="step-title">
          <setting-outlined /> {{ t('第二步：ModPack 配置') }}
        </h4>
        <p class="step-desc">
  {{ t('請注意：為防止錯誤，僅支持安裝有官方 Server Pack 的 Modpack！ 如有疑問請閱讀 <a href="你的網址" target="_blank">知識庫</a> 內容') }}
</p>
        
        <a-form layout="vertical" class="mt-4">
          <a-form-item :label="t('CurseForge API Key')">
            <a-input-password v-model:value="form.apiKey" placeholder="Your API Key">
              <template #prefix><key-outlined class="input-icon" /></template>
            </a-input-password>
          </a-form-item>

          <a-row :gutter="12">
            <a-col :span="14">
              <a-form-item :label="t('Project ID')">
                <a-input v-model:value="form.projectId" placeholder="285682">
                  <template #prefix><code-outlined class="input-icon" /></template>
                </a-input>
              </a-form-item>
            </a-col>
            <a-col :span="10">
              <a-form-item :label="t('File ID (選填)')">
                <a-input v-model:value="form.versionId" placeholder="latest" />
              </a-form-item>
            </a-col>
          </a-row>

          <div class="footer-actions">
            <a-button @click="isVisible = false">{{ t('取消') }}</a-button>
            <a-button 
              type="primary" 
              :loading="confirmLoading" 
              :disabled="!hasCleaned"
              class="submit-btn"
              @click="handleInstall"
            >
              <template #icon><cloud-download-outlined /></template>
              {{ hasCleaned ? t('開始安裝任務') : t('請先完成第一步') }}
            </a-button>
          </div>
        </a-form>
      </div>
    </div>
  </a-modal>
</template>

<style scoped>
/* --- 基礎容器 --- */
.install-container {
  padding: 4px 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* --- 通用卡片樣式 --- */
.step-card {
  border-radius: 12px;
  padding: 16px;
  border: 1px solid rgba(140, 140, 140, 0.15);
  transition: all 0.3s ease;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
}

.step-title {
  font-weight: 600;
  font-size: 15px;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: inherit;
}

.step-desc {
  font-size: 12px;
  opacity: 0.6;
  margin: 0;
}

/* --- 危險區域 (清空伺服器) --- */
.danger-zone {
  background: rgba(255, 77, 79, 0.04);
  border-color: rgba(255, 77, 79, 0.15);
}

.danger-zone .danger {
  color: #ff4d4f;
}

.card-action {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.checkbox-text {
  font-size: 12px;
}

/* --- 配置區域 --- */
.config-zone {
  background: rgba(22, 119, 255, 0.04);
  border-color: rgba(22, 119, 255, 0.15);
}

.config-zone.is-locked {
  opacity: 0.4;
  filter: grayscale(0.5);
  pointer-events: none;
  cursor: not-allowed;
}

/* --- 表單控制 --- */
.input-icon {
  color: rgba(140, 140, 140, 0.45);
}

.footer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 24px;
}

.submit-btn {
  min-width: 140px;
  font-weight: 500;
}

.status-tag {
  border-radius: 6px;
  padding: 0 8px;
}

/* --- 動畫 --- */
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

/* 適配微小調整 */
:deep(.ant-form-item) {
  margin-bottom: 12px;
}

:deep(.ant-input-affix-wrapper), :deep(.ant-input) {
  border-radius: 6px;
}
</style>
