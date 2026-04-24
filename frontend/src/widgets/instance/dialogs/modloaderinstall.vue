<script setup lang="ts">
import { ref, reactive, watch, createVNode } from "vue";
import { t } from "@/lang/i18n";
import { message, Modal } from "ant-design-vue";
import { 
  CloudDownloadOutlined, 
  SettingOutlined, 
  DeleteOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined
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

// 數據列表
const mcVersions = ref<string[]>([]);
const loaderVersions = ref<any[]>([]);
const loadingLoaders = ref(false);

const form = reactive({
  mcVersion: "",
  loaderType: "forge",
  loaderVersion: ""
});

const { execute: fetchFileList } = fileList();
const { execute: executeDelete } = deleteFile();

// 打開對話框並初始化 MC 版本
const openDialog = async () => {
  if (props.instanceInfo.status !== 0) {
    return message.error(t("請先關閉伺服器"));
  }
  isVisible.value = true;
  hasCleaned.value = false;
  try {
    const res = await axios.get(`/api/protected/daemon/modloader/mc_versions`, {
      params: { daemonId: props.daemonId }
    });
    mcVersions.value = res.data;
  } catch (err) {
    message.error(t("獲取 MC 版本失敗"));
  }
};

// 監聽 MC 版本或 Loader 類型變化，獲取對應的 Loader 版本
watch([() => form.mcVersion, () => form.loaderType], async ([newMc, newType]) => {
  if (!newMc || !newType) return;
  
  loadingLoaders.value = true;
  form.loaderVersion = ""; 
  try {
    const res = await axios.get(`/api/protected/daemon/modloader/loader_versions`, {
      params: { 
        daemonId: props.daemonId,
        mcVersion: newMc,
        type: newType
      }
    });
    // 統一化處理不同來源的數據格式
    loaderVersions.value = res.data;
  } catch (err) {
    message.error(t("獲取 Loader 版本失敗"));
  } finally {
    loadingLoaders.value = false;
  }
});

// 清空伺服器邏輯 (保留您原始邏輯)
const handleCleanServer = async () => {
  Modal.confirm({
    title: t("確定要清空伺服器嗎？"),
    icon: createVNode(ExclamationCircleOutlined, { style: 'color: #ff4d4f' }),
    content: t("這將刪除您的所有檔案，此操作不可撤銷！"),
    okText: t("確定清空"),
    onOk: async () => {
      try {
        isCleaning.value = true;
        const res = await fetchFileList({
          params: { daemonId: props.daemonId, uuid: props.instanceId, target: "/", page: 0, page_size: 500 }
        });
        const targets = (res.value?.items || [])
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

const handleInstall = async () => {
  if (!form.mcVersion || !form.loaderVersion) return message.warning(t("請選擇版本"));

  Modal.confirm({
    title: t("確認安裝"),
    content: `${t('即將安裝')} ${form.loaderType} - ${form.loaderVersion}`,
    onOk: async () => {
      try {
        confirmLoading.value = true;
        // 調用後端安裝介面 (需在後端實作 install 邏輯)
        await axios.post(`/api/protected/daemon/modloader/install`, {
            daemonId: props.daemonId,
            uuid: props.instanceId,
            ...form
        });
        message.success(t("安裝任務已啟動"));
        isVisible.value = false;
      } catch (err: any) {
        message.error(t("安裝失敗"));
      } finally {
        confirmLoading.value = false;
      }
    }
  });
};

defineExpose({ openDialog });
</script>

<template>
  <a-modal v-model:open="isVisible" centered :title="t('Mod Loader 自動安裝')" :footer="null" :width="520">
    <div class="install-container">
      <div class="step-card danger-zone">
        <div class="card-header">
          <h4 class="step-title danger"><delete-outlined /> {{ t('第一步：環境清理') }}</h4>
          <a-tag v-if="hasCleaned" color="success"><check-circle-outlined /> {{ t('已完成') }}</a-tag>
        </div>
        <div class="card-action">
          <a-checkbox v-model:checked="agreeClean" :disabled="hasCleaned">
            <span class="checkbox-text">{{ t('我同意清空所有檔案（排除備份夾）') }}</span>
          </a-checkbox>
          <a-button danger block :loading="isCleaning" :disabled="!agreeClean || hasCleaned" @click="handleCleanServer">
            {{ hasCleaned ? t('伺服器已就緒') : t('立即執行環境清空') }}
          </a-button>
        </div>
      </div>

      <div class="step-card config-zone" :class="{ 'is-locked': !hasCleaned }">
        <h4 class="step-title"><setting-outlined /> {{ t('第二步：選擇版本') }}</h4>
        <a-form layout="vertical" class="mt-4">
          <a-form-item :label="t('Minecraft 版本')">
            <a-select v-model:value="form.mcVersion" show-search placeholder="例如: 1.20.1">
              <a-select-option v-for="v in mcVersions" :key="v" :value="v">{{ v }}</a-select-option>
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
                <a-select v-model:value="form.loaderVersion" :loading="loadingLoaders" placeholder="選擇 Loader 版本">
                  <a-select-option v-for="item in loaderVersions" :key="item.version" :value="item.version">
                    {{ item.version }} {{ item.tag || '' }}
                  </a-select-option>
                </a-select>
              </a-form-item>
            </a-col>
          </a-row>

          <div class="footer-actions">
            <a-button @click="isVisible = false">{{ t('取消') }}</a-button>
            <a-button type="primary" :loading="confirmLoading" :disabled="!hasCleaned || !form.loaderVersion" @click="handleInstall">
              <template #icon><cloud-download-outlined /></template>
              {{ t('開始自動安裝') }}
            </a-button>
          </div>
        </a-form>
      </div>
    </div>
  </a-modal>
</template>

<style scoped>
/* 延用您原本的 CSS 樣式... */
.is-locked { opacity: 0.5; pointer-events: none; }
.step-card { border: 1px solid #eee; padding: 15px; border-radius: 8px; margin-bottom: 10px; }
.danger-zone { background: #fff1f0; }
.config-zone { background: #f0f5ff; }
</style>
