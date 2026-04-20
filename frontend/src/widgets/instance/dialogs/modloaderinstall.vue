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
import axios from "axios";

// 導入剛剛定義的 API
import { installModLoader } from "@/services/apis/instance"; 

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
 * 獲取 Minecraft 版本 (參考 PCL 使用穩定可靠的來源)
 */
const fetchMCVersions = async () => {
  try {
    const res = await axios.get("https://meta.fabricmc.net/v2/versions/game");
    mcVersions.value = res.data
      .filter((v: any) => v.stable)
      .map((v: any) => v.version);
  } catch (err) {
    message.error("無法獲取版本清單");
  }
};

/**
 * 獲取 Loader 版本 (參考 PCL 的多鏡像源邏輯，優先使用 BMCLAPI 以保證速度)
 */
const fetchLoaderVersions = async () => {
  if (!form.mcVersion) return;
  loadingVersions.value = true;
  loaderVersions.value = [];
  
  try {
    let url = "";
    let data: any[] = [];

    switch (form.loaderType) {
      case "forge":
        url = `https://bmclapi2.bangbang93.com/forge/minecraft/${form.mcVersion}`;
        const forgeRes = await axios.get(url);
        data = forgeRes.data.map((v: any) => v.version).reverse();
        break;
      case "neoforge":
        url = `https://bmclapi2.bangbang93.com/neoforge/list/${form.mcVersion}`;
        const neoRes = await axios.get(url);
        data = neoRes.data.map((v: any) => v.version).reverse();
        break;
      case "fabric":
        url = `https://meta.fabricmc.net/v2/versions/loader/${form.mcVersion}`;
        const fabRes = await axios.get(url);
        data = fabRes.data.map((v: any) => v.loader.version);
        break;
      case "quilt":
        url = `https://meta.quiltmc.org/v3/versions/loader/${form.mcVersion}`;
        const quiltRes = await axios.get(url);
        data = quiltRes.data.map((v: any) => v.loader.version);
        break;
    }

    loaderVersions.value = data;
    if (data.length > 0) {
      form.loaderVersion = data[0]; // 預設選擇最新版
    } else {
      form.loaderVersion = "";
      message.warning(t("當前 MC 版本無對應的加載器"));
    }
  } catch (err) {
    console.error("Fetch loader error:", err);
    message.error(t("獲取加載器版本失敗"));
  } finally {
    loadingVersions.value = false;
  }
};

// 監聽 MC 版本或 Loader 類型變化，自動刷新列表
watch(() => [form.mcVersion, form.loaderType], () => {
  fetchLoaderVersions();
});

/**
 * 執行安裝任務 (對接 Bash 腳本所需的參數)
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
        
        // 此處參數與 instance.ts 的定義嚴格對應
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
    :title="t('自定義 ModLoader 安裝器')"
    :footer="null"
    :width="500"
    destroy-on-close
  >
    <div class="install-container">
      <div class="step-card" :class="hasCleaned ? 'success-zone' : 'danger-zone'">
        <div class="card-header">
          <span class="step-title"><delete-outlined /> {{ t('1. 環境清理') }}</span>
          <a-tag v-if="hasCleaned" color="success"><check-circle-outlined /> {{ t('就緒') }}</a-tag>
        </div>
        <p class="desc-text">{{ t('安裝新版 ModLoader 前，建議清空當前伺服器檔案以防止衝突。') }}</p>
        <div class="mt-2">
          <a-checkbox v-model:checked="agreeClean" :disabled="hasCleaned">
            <span class="check-label">{{ t('我已知曉此操作將會覆蓋現有環境') }}</span>
          </a-checkbox>
          <a-button 
            block 
            danger 
            class="mt-2"
            :disabled="!agreeClean || hasCleaned"
            @click="hasCleaned = true"
          >
            {{ hasCleaned ? t('伺服器環境已標記為乾淨') : t('確認清理環境') }}
          </a-button>
        </div>
      </div>

      <div class="step-card config-zone" :class="{ 'is-locked': !hasCleaned }">
        <div class="step-title"><setting-outlined /> {{ t('2. 版本配置') }}</div>
        
        <a-form layout="vertical" class="mt-4">
          <a-form-item :label="t('Minecraft 版本')">
            <a-select v-model:value="form.mcVersion" show-search placeholder="選擇版本">
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

          <a-form-item :label="t('Loader 版本')">
            <a-select 
              v-model:value="form.loaderVersion" 
              :loading="loadingVersions"
              :disabled="!form.mcVersion"
            >
              <a-select-option v-for="v in loaderVersions" :key="v" :value="v">{{ v }}</a-select-option>
            </a-select>
          </a-form-item>

          <div class="tips">
            <info-circle-outlined /> {{ t('提示：NeoForge 僅支援 1.20.1 以上版本') }}
          </div>

          <div class="footer-actions">
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
.install-container { display: flex; flex-direction: column; gap: 16px; }
.step-card { border-radius: 10px; padding: 16px; border: 1px solid #f0f0f0; transition: all 0.3s; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.step-title { font-weight: 700; font-size: 15px; display: flex; align-items: center; gap: 8px; }
.desc-text { font-size: 12px; color: #8c8c8c; margin: 4px 0 8px; }
.danger-zone { background: #fff1f0; border-color: #ffa39e; }
.success-zone { background: #f6ffed; border-color: #b7eb8f; }
.config-zone { background: #fafafa; }
.is-locked { opacity: 0.4; pointer-events: none; filter: grayscale(1); }
.check-label { font-size: 12px; }
.w-full { width: 100%; display: flex; }
.w-full > label { flex: 1; text-align: center; }
.tips { font-size: 12px; color: #1890ff; margin-top: -8px; margin-bottom: 12px; }
.footer-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
.mt-2 { margin-top: 8px; }
.mt-4 { margin-top: 16px; }
</style>
