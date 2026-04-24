<script setup lang="ts">
import { ref, reactive, watch, createVNode } from "vue";
import { t } from "@/lang/i18n";
import { message, Modal } from "ant-design-vue";
import { 
  SettingOutlined,
  ThunderboltOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  InfoCircleOutlined,
  ExclamationCircleOutlined
} from "@ant-design/icons-vue";

// 導入核心 API
import { installModLoader } from "@/services/apis/instance"; 
import { fileList, deleteFile } from "@/services/apis/fileManager";
import axios from "axios";

const props = defineProps<{
  daemonId: string;
  instanceId: string;
  instanceInfo: any; 
}>();

const isVisible = ref(false);
const loadingVersions = ref(false);
const confirmLoading = ref(false);
const isCleaning = ref(false);
const hasCleaned = ref(false);
const agreeClean = ref(false);

const form = reactive({
  mcVersion: "",
  loaderType: "forge" as "forge" | "neoforge" | "fabric" | "quilt",
  loaderVersion: ""
});

const mcVersions = ref<string[]>([]);
const loaderVersions = ref<string[]>([]);

// 獲取文件管理的 API 方法
const { execute: fetchFileList } = fileList();
const { execute: executeDelete } = deleteFile();

const openDialog = async () => {
  if (props.instanceInfo.status !== 0) {
    return message.error(t("請先關閉伺服器"));
  }
  isVisible.value = true;
  if (mcVersions.value.length === 0) fetchMCVersions();
};

/**
 * 真正執行伺服器清空邏輯 (參考你提供的代碼)
 */
const handleCleanServer = async () => {
  Modal.confirm({
    title: t("確定要清空伺服器嗎？"),
    icon: createVNode(ExclamationCircleOutlined, { style: 'color: #ff4d4f' }),
    content: t("這將刪除當前伺服器所有檔案（備份文件除外），確保環境純淨。"),
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
        // 排除掉備份文件夾，避免誤刪
        const targets = allItems
          .filter((item: any) => item.name !== "LazyCloud_backup" && item.name !== "backups")
          .map((item: any) => "/" + item.name);

        if (targets.length > 0) {
          await executeDelete({
            params: { daemonId: props.daemonId, uuid: props.instanceId },
            data: { targets }
          });
        }
        
        message.success(t("環境清理完成"));
        hasCleaned.value = true;
      } catch (err: any) {
        message.error(t("清理失敗: ") + (err.message || "Unknown Error"));
      } finally {
        isCleaning.value = false;
      }
    }
  });
};

/**
 * 透過後端代理獲取 MC 版本
 */
const fetchMCVersions = async () => {
  try {
    const res = await axios.get(`/api/protected/daemon/modloader/mc_versions`, {
      params: { daemonId: props.daemonId }
    });
    mcVersions.value = res.data
      .filter((v: any) => v.stable)
      .map((v: any) => v.version);
  } catch (err) {
    message.error(t("無法獲取版本清單"));
  }
};

/**
 * 透過後端代理獲取 Loader 版本
 */
const fetchLoaderVersions = async () => {
  if (!form.mcVersion) return;
  loadingVersions.value = true;
  loaderVersions.value = [];
  
  try {
    const res = await axios.get(`/api/protected/daemon/modloader/loader_versions`, {
      params: {
        daemonId: props.daemonId,
        type: form.loaderType,
        mcVersion: form.mcVersion
      }
    });

    const rawData = res.data;
    let data: any[] = [];
    
    if (form.loaderType === "forge" || form.loaderType === "neoforge") {
      data = rawData.map((v: any) => v.version).reverse();
    } else {
      data = rawData.map((v: any) => v.loader.version);
    }

    loaderVersions.value = data;
    if (data.length > 0) form.loaderVersion = data[0];
  } catch (err) {
    message.error(t("獲取加載器版本失敗"));
  } finally {
    loadingVersions.value = false;
  }
};

watch(() => [form.mcVersion, form.loaderType], () => fetchLoaderVersions());

const handleInstall = async () => {
  if (!form.mcVersion || !form.loaderVersion) return message.warning(t("請選擇完整版本"));

  Modal.confirm({
    title: t("確認安裝"),
    content: `${form.loaderType.toUpperCase()} - ${form.mcVersion}`,
    onOk: async () => {
      try {
        confirmLoading.value = true;
        // 將實例狀態設為安裝中
        props.instanceInfo.status = 2; 

        await installModLoader().execute({
          params: {
            daemonId: props.daemonId,
            uuid: props.instanceId,
            task_name: "modloader_install"
          },
          data: {
            minecraft_version: form.mcVersion,
            loader_type: form.loaderType,
            loader_version: form.loaderVersion
          }
        });

        message.success(t("安裝任務已啟動"));
        isVisible.value = false;
      } catch (err: any) {
        props.instanceInfo.status = 0;
        message.error(t("啟動失敗"));
      } finally {
        confirmLoading.value = false;
      }
    }
  });
};

defineExpose({ openDialog });
</script>

<template>
  <a-modal v-model:open="isVisible" centered :title="t('ModLoader 自動安裝')" :footer="null" :width="500" destroy-on-close>
    <div class="install-container">
      <div class="step-card" :class="hasCleaned ? 'success-zone' : 'danger-zone'">
        <div class="card-header">
          <span class="step-title"><delete-outlined /> {{ t('1. 環境清理') }}</span>
          <a-tag v-if="hasCleaned" color="success">{{ t('已清理') }}</a-tag>
        </div>
        <p class="desc-text">{{ t('安裝新加載器前，強烈建議清空伺服器以避免 Mod 衝突。') }}</p>
        <div class="mt-2">
          <a-checkbox v-model:checked="agreeClean" :disabled="hasCleaned">
            <span class="check-label">{{ t('我已知曉此操作不可逆') }}</span>
          </a-checkbox>
          <a-button block danger :loading="isCleaning" :disabled="!agreeClean || hasCleaned" @click="handleCleanServer">
            {{ hasCleaned ? t('伺服器已就緒') : t('立即執行清空伺服器') }}
          </a-button>
        </div>
      </div>

      <div class="step-card config-zone" :class="{ 'is-locked': !hasCleaned }">
        <div class="step-title"><setting-outlined /> {{ t('2. 版本選擇') }}</div>
        <a-form layout="vertical" class="mt-4">
          <a-form-item :label="t('遊戲版本')">
            <a-select v-model:value="form.mcVersion" show-search>
              <a-select-option v-for="v in mcVersions" :key="v" :value="v">{{ v }}</a-select-option>
            </a-select>
          </a-form-item>
          <a-form-item :label="t('加載器類型')">
            <a-radio-group v-model:value="form.loaderType" button-style="solid" class="w-full">
              <a-radio-button value="forge">Forge</a-radio-button>
              <a-radio-button value="neoforge">NeoForge</a-radio-button>
              <a-radio-button value="fabric">Fabric</a-radio-button>
              <a-radio-button value="quilt">Quilt</a-radio-button>
            </a-radio-group>
          </a-form-item>
          <a-form-item :label="t('加載器版本')">
            <a-select v-model:value="form.loaderVersion" :loading="loadingVersions" :disabled="!form.mcVersion">
              <a-select-option v-for="v in loaderVersions" :key="v" :value="v">{{ v }}</a-select-option>
            </a-select>
          </a-form-item>
          <div class="footer-actions">
            <a-button @click="isVisible = false">{{ t('取消') }}</a-button>
            <a-button type="primary" :loading="confirmLoading" :disabled="!form.loaderVersion || !hasCleaned" @click="handleInstall">
              <template #icon><thunderbolt-outlined /></template>
              {{ t('開始安裝') }}
            </a-button>
          </div>
        </a-form>
      </div>
    </div>
  </a-modal>
</template>

<style scoped>
.install-container { display: flex; flex-direction: column; gap: 16px; }
.step-card { border-radius: 10px; padding: 16px; border: 1px solid #f0f0f0; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.step-title { font-weight: bold; }
.danger-zone { background: #fff1f0; border-color: #ffa39e; }
.success-zone { background: #f6ffed; border-color: #b7eb8f; }
.is-locked { opacity: 0.4; pointer-events: none; }
.w-full { width: 100%; display: flex; }
.w-full > label { flex: 1; text-align: center; }
.footer-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
.mt-2 { margin-top: 8px; }
.mt-4 { margin-top: 16px; }
</style>
