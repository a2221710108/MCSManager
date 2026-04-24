<script setup lang="ts">
import { ref, reactive, watch } from "vue";
import { t } from "@/lang/i18n";
import { message, Modal } from "ant-design-vue";
import { 
  SettingOutlined,
  ThunderboltOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  InfoCircleOutlined
} from "@ant-design/icons-vue";

// 導入 MCSManager 核心 API 封裝
import { installModLoader } from "@/services/apis/instance"; 
import request from "@/services/public"; 

const props = defineProps<{
  daemonId: string;
  instanceId: string;
  instanceInfo: any; 
}>();

const isVisible = ref(false);
const loadingVersions = ref(false);
const confirmLoading = ref(false);
const hasCleaned = ref(false);
const agreeClean = ref(false);

const form = reactive({
  mcVersion: "",
  loaderType: "forge" as "forge" | "neoforge" | "fabric" | "quilt",
  loaderVersion: ""
});

const mcVersions = ref<string[]>([]);
const loaderVersions = ref<string[]>([]);

// 開啟彈窗並獲取 MC 版本
const openDialog = async () => {
  if (props.instanceInfo.status !== 0) {
    return message.error(t("請先關閉伺服器"));
  }
  isVisible.value = true;
  if (mcVersions.value.length === 0) fetchMCVersions();
};

/**
 * 獲取 Minecraft 版本 (透過 Daemon 代理)
 */
const fetchMCVersions = async () => {
  try {
    // 這裡的路徑對應你在 daemon/src/routers/get_modloader_version.ts 定義的路由
    // 注意：如果是基於 MCSManager 標準架構，路徑通常需要加上 daemonId
    const res: any = await request.get(`/api/protected/daemon/modloader/mc_versions`, {
      params: { daemonId: props.daemonId }
    });
    
    // 這裡過濾掉快照版，僅保留穩定版
    mcVersions.value = res
      .filter((v: any) => v.stable)
      .map((v: any) => v.version);
  } catch (err) {
    console.error(err);
    message.error(t("無法獲取 Minecraft 版本清單"));
  }
};

/**
 * 獲取 Loader 版本 (透過 Daemon 代理)
 */
const fetchLoaderVersions = async () => {
  if (!form.mcVersion) return;
  loadingVersions.value = true;
  loaderVersions.value = [];
  
  try {
    // 請求你剛剛放置的後端文件中的路徑
    const res: any = await request.get(`/api/protected/daemon/modloader/loader_versions`, {
      params: {
        daemonId: props.daemonId,
        type: form.loaderType,
        mcVersion: form.mcVersion
      }
    });

    let data: any[] = [];
    
    // 根據加載器類型處理數據結構
    if (form.loaderType === "forge" || form.loaderType === "neoforge") {
      data = res.map((v: any) => v.version).reverse();
    } else {
      // Fabric / Quilt 的數據格式處理
      data = res.map((v: any) => v.loader.version);
    }

    loaderVersions.value = data;
    if (data.length > 0) {
      form.loaderVersion = data[0]; 
    } else {
      form.loaderVersion = "";
      message.warning(t("該版本下找不到對應的 Loader"));
    }
  } catch (err) {
    message.error(t("獲取 Loader 版本失敗"));
  } finally {
    loadingVersions.value = false;
  }
};

// 監聽 MC 版本或 Loader 類型變化
watch(() => [form.mcVersion, form.loaderType], () => {
  fetchLoaderVersions();
});

/**
 * 提交安裝任務
 */
const handleInstall = async () => {
  if (!form.mcVersion || !form.loaderVersion) {
    return message.warning(t("請選擇完整的版本資訊"));
  }

  Modal.confirm({
    title: t("確認安裝配置"),
    content: `${form.loaderType.toUpperCase()} - ${form.mcVersion} (${form.loaderVersion})`,
    onOk: async () => {
      try {
        confirmLoading.value = true;
        
        // 執行現有的安裝 API 任務
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

        message.success(t("安裝任務已在背景啟動，請查看控制台"));
        isVisible.value = false;
      } catch (err: any) {
        message.error(t("啟動失敗: ") + (err.message || "Unknown Error"));
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
    :title="t('自定義 ModLoader 安裝')"
    :footer="null"
    :width="520"
    destroy-on-close
  >
    <div class="install-wrapper">
      <div class="card clean-step" :class="hasCleaned ? 'is-done' : 'is-pending'">
        <div class="card-header">
          <span class="title"><delete-outlined /> {{ t('1. 安全檢查') }}</span>
          <a-tag v-if="hasCleaned" color="success">{{ t('已確認') }}</a-tag>
        </div>
        <p class="hint">{{ t('安裝 Loader 可能會覆蓋核心檔案，建議備份後再執行。') }}</p>
        <div class="action-row">
          <a-checkbox v-model:checked="agreeClean" :disabled="hasCleaned">
            {{ t('我同意清理/覆蓋環境') }}
          </a-checkbox>
          <a-button 
            size="small"
            danger 
            :disabled="!agreeClean || hasCleaned"
            @click="hasCleaned = true"
          >
            {{ hasCleaned ? t('就緒') : t('確認') }}
          </a-button>
        </div>
      </div>

      <div class="card config-step" :class="{ 'is-disabled': !hasCleaned }">
        <div class="title"><setting-outlined /> {{ t('2. 安裝選項') }}</div>
        
        <a-form layout="vertical" class="mt-4">
          <a-form-item :label="t('遊戲版本')">
            <a-select v-model:value="form.mcVersion" show-search :placeholder="t('搜尋版本...')">
              <a-select-option v-for="v in mcVersions" :key="v" :value="v">{{ v }}</a-select-option>
            </a-select>
          </a-form-item>

          <a-form-item :label="t('加載器類型')">
            <a-radio-group v-model:value="form.loaderType" button-style="solid" class="flex-group">
              <a-radio-button value="forge">Forge</a-radio-button>
              <a-radio-button value="neoforge">NeoForge</a-radio-button>
              <a-radio-button value="fabric">Fabric</a-radio-button>
              <a-radio-button value="quilt">Quilt</a-radio-button>
            </a-radio-group>
          </a-form-item>

          <a-form-item :label="t('Loader 版本')">
            <a-select 
              v-model:value="form.loaderVersion" 
              :loading="loadingVersions"
              :disabled="!form.mcVersion"
              :placeholder="t('等待加載...')"
            >
              <a-select-option v-for="v in loaderVersions" :key="v" :value="v">{{ v }}</a-select-option>
            </a-select>
          </a-form-item>

          <div class="tips-box">
            <info-circle-outlined /> {{ t('提示：數據由當前節點 (Daemon) 實時獲取') }}
          </div>

          <div class="modal-footer">
            <a-button @click="isVisible = false">{{ t('取消') }}</a-button>
            <a-button 
              type="primary" 
              :loading="confirmLoading"
              :disabled="!form.loaderVersion || !hasCleaned"
              @click="handleInstall"
            >
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
.install-wrapper { display: flex; flex-direction: column; gap: 20px; }
.card { border-radius: 8px; padding: 16px; border: 1px solid #e8e8e8; transition: all 0.2s; }
.card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.title { font-weight: bold; font-size: 14px; display: flex; align-items: center; gap: 6px; }
.hint { font-size: 12px; color: #666; margin-bottom: 12px; }
.action-row { display: flex; justify-content: space-between; align-items: center; }

.is-pending { background-color: #fff7f6; border-color: #ffccc7; }
.is-done { background-color: #f6ffed; border-color: #b7eb8f; }
.is-disabled { opacity: 0.5; pointer-events: none; filter: grayscale(0.8); }

.flex-group { display: flex; width: 100%; }
.flex-group > label { flex: 1; text-align: center; }

.tips-box { font-size: 12px; color: #096dd9; background: #e6f7ff; padding: 8px; border-radius: 4px; margin-bottom: 16px; }
.modal-footer { display: flex; justify-content: flex-end; gap: 12px; }
.mt-4 { margin-top: 16px; }
</style>
