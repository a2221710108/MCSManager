<script setup lang="ts">
import { ref, reactive, watch, createVNode } from "vue";
import { t } from "@/lang/i18n";
import { message, Modal } from "ant-design-vue";
import { 
  CloudDownloadOutlined, 
  SettingOutlined, 
  CodeOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined,
  KeyOutlined
} from "@ant-design/icons-vue";
import axios from "axios";
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

// 數據存儲
const mcVersions = ref<string[]>([]);
const loaderVersions = ref<{version: string, tag?: string}[]>([]);
const loadingLoaders = ref(false);

const form = reactive({
  mcVersion: "",
  loaderType: "forge",
  loaderVersion: ""
});

const { execute: fetchFileList } = fileList();
const { execute: executeDelete } = deleteFile();

/**
 * 打開彈窗並初始化 Minecraft 版本列表
 */
const openDialog = async () => {
  if (props.instanceInfo.status !== 0) {
    return message.error(t("請先關閉伺服器"));
  }
  isVisible.value = true;
  hasCleaned.value = false;
  agreeClean.value = false;
  
  try {
    // 調用後端獲取 MC 版本
    const res = await axios.post(`/api/protected/daemon/instance/asynchronous`, {
      daemonId: props.daemonId,
      instanceUuid: props.instanceId,
      taskName: "modloader/mc_versions",
      parameter: {}
    });
    mcVersions.value = res.data.data || res.data;
  } catch (err) {
    message.error(t("獲取 Minecraft 版本列表失敗"));
  }
};

/**
 * 監聽選擇變化，自動獲取 Loader 版本
 */
watch([() => form.mcVersion, () => form.loaderType], async ([newMc, newType]) => {
  if (!newMc || !newType) return;
  
  loadingLoaders.value = true;
  form.loaderVersion = ""; 
  try {
    const res = await axios.post(`/api/protected/daemon/instance/asynchronous`, {
      daemonId: props.daemonId,
      instanceUuid: props.instanceId,
      taskName: "modloader/loader_versions",
      parameter: {
        mcVersion: newMc,
        type: newType
      }
    });
    loaderVersions.value = res.data.data || res.data;
  } catch (err) {
    message.error(t("獲取 ModLoader 版本失敗"));
  } finally {
    loadingLoaders.value = false;
  }
});

/**
 * 執行清空伺服器邏輯
 */
const handleCleanServer = async () => {
  Modal.confirm({
    title: t("確定要清空伺服器嗎？"),
    icon: createVNode(ExclamationCircleOutlined, { style: 'color: #ff4d4f' }),
    content: t("這將刪除您的所有檔案（不含備份夾），此操作不可撤銷！"),
    okText: t("確定清空"),
    okType: "danger",
    onOk: async () => {
      try {
        isCleaning.value = true;
        const res = await fetchFileList({
          params: { 
            daemonId: props.daemonId, 
            uuid: props.instanceId, 
            target: "/",
            page: 0,
            page_size: 500,
            file_name: ""
          }
        });
        
        const allItems = res.value?.items || [];
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
        message.error(t("清空失敗"));
      } finally {
        isCleaning.value = false;
      }
    }
  });
};

/**
 * 提交安裝任務
 */
const handleInstall = async () => {
  if (!form.mcVersion || !form.loaderVersion) {
    return message.warning(t("請選擇完整的版本資訊"));
  }

  Modal.confirm({
    title: t("確認自動安裝"),
    content: `${t('即將安裝')} ${form.loaderType} (${form.loaderVersion}) ${t('至 Minecraft')} ${form.mcVersion}`,
    onOk: async () => {
      try {
        confirmLoading.value = true;
        // 這裡調用你後續要在後端實作的 install 任務
        await axios.post(`/api/protected/daemon/instance/asynchronous`, {
          daemonId: props.daemonId,
          instanceUuid: props.instanceId,
          taskName: "modloader/install_task", 
          parameter: { ...form }
        });

        message.success(t("安裝任務已在後端啟動"));
        isVisible.value = false;
      } catch (err: any) {
        Modal.error({ title: t("任務啟動失敗"), content: err.message });
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
    :title="t('自動化 ModLoader 安裝')"
    :footer="null"
    :mask-closable="false"
    destroy-on-close
    :width="560"
  >
    <div class="install-container">
      <div class="step-card danger-zone">
        <div class="card-header">
          <div class="header-content">
            <h4 class="step-title danger">
              <delete-outlined /> {{ t('第一步：環境清理') }}
            </h4>
            <p class="step-desc">{{ t('為了確保安裝成功，必須先清空現有核心與插件檔案。') }}</p>
          </div>
          <transition name="fade">
            <a-tag v-if="hasCleaned" color="success" class="status-tag">
              <check-circle-outlined /> {{ t('已就緒') }}
            </a-tag>
          </transition>
        </div>

        <div class="card-action">
          <a-checkbox v-model:checked="agreeClean" :disabled="hasCleaned" class="custom-checkbox">
            <span class="checkbox-text">{{ t('我已知曉此操作會刪除伺服器目錄下的所有檔案') }}</span>
          </a-checkbox>
          <a-button 
            danger 
            block
            :loading="isCleaning"
            :disabled="!agreeClean || hasCleaned"
            class="action-btn"
            @click="handleCleanServer"
          >
            {{ hasCleaned ? t('伺服器環境已清空') : t('立即執行環境清理') }}
          </a-button>
        </div>
      </div>

      <div class="step-card config-zone" :class="{ 'is-locked': !hasCleaned }">
        <h4 class="step-title">
          <setting-outlined /> {{ t('第二步：版本與類型配置') }}
        </h4>
        
        <a-form layout="vertical" class="mt-4">
          <a-form-item :label="t('Minecraft 版本')">
            <a-select 
              v-model:value="form.mcVersion" 
              show-search 
              :placeholder="t('請選擇或搜尋版本號')"
            >
              <a-select-option v-for="v in mcVersions" :key="v" :value="v">
                {{ v }}
              </a-select-option>
            </a-select>
          </a-form-item>

          <a-row :gutter="12">
            <a-col :span="10">
              <a-form-item :label="t('Loader 類型')">
                <a-select v-model:value="form.loaderType">
                  <a-select-option value="forge">Forge</a-select-option>
                  <a-select-option value="neoforge">NeoForge</a-select-option>
                  <a-select-option value="fabric">Fabric</a-select-option>
                </a-select>
              </a-form-item>
            </a-col>
            <a-col :span="14">
              <a-form-item :label="t('Loader 版本')">
                <a-select 
                  v-model:value="form.loaderVersion" 
                  :loading="loadingLoaders"
                  :disabled="!form.mcVersion"
                  placeholder="請選擇 Loader 版本"
                >
                  <a-select-option v-for="item in loaderVersions" :key="item.version" :value="item.version">
                    {{ item.version }} <span style="opacity: 0.5; font-size: 12px;">{{ item.tag }}</span>
                  </a-select-option>
                </a-select>
              </a-form-item>
            </a-col>
          </a-row>

          <div class="footer-actions">
            <a-button @click="isVisible = false">{{ t('取消') }}</a-button>
            <a-button 
              type="primary" 
              :loading="confirmLoading" 
              :disabled="!hasCleaned || !form.loaderVersion"
              class="submit-btn"
              @click="handleInstall"
            >
              <template #icon><cloud-download-outlined /></template>
              {{ hasCleaned ? t('開始自動安裝任務') : t('請先完成第一步') }}
            </a-button>
          </div>
        </a-form>
      </div>
    </div>
  </a-modal>
</template>

<style scoped>
.install-container {
  padding: 4px 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

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
}

.step-desc {
  font-size: 12px;
  opacity: 0.6;
  margin: 0;
}

.danger-zone {
  background: rgba(255, 77, 79, 0.04);
  border-color: rgba(255, 77, 79, 0.15);
}
.danger { color: #ff4d4f; }

.config-zone {
  background: rgba(22, 119, 255, 0.04);
  border-color: rgba(22, 119, 255, 0.15);
}

.config-zone.is-locked {
  opacity: 0.4;
  filter: grayscale(0.8);
  pointer-events: none;
  cursor: not-allowed;
}

.footer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
}

.submit-btn {
  min-width: 160px;
  font-weight: 500;
}

/* 適配微調 */
:deep(.ant-form-item) { margin-bottom: 12px; }
:deep(.ant-select) { width: 100%; }

.fade-enter-active, .fade-leave-active { transition: opacity 0.3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
