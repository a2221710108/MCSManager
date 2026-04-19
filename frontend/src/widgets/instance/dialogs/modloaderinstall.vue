<script setup lang="ts">
import { ref, reactive, onMounted, watch, computed } from "vue";
import { t } from "@/lang/i18n";
import { message, Modal } from "ant-design-vue";
import { 
  BuildOutlined, 
  ThunderboltOutlined, 
  SettingOutlined,
  CloudDownloadOutlined,
  ExclamationCircleOutlined,
  DeleteOutlined
} from "@ant-design/icons-vue";
import axios from "axios";

// 假設的後端 API
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

// 表單數據
const form = reactive({
  mcVersion: "",
  loaderType: "forge" as "forge" | "neoforge" | "fabric" | "quilt",
  loaderVersion: ""
});

// 資料庫清單
const mcVersions = ref<string[]>([]);
const loaderVersions = ref<string[]>([]);

// 開啟視窗
const openDialog = async () => {
  if (props.instanceInfo.status !== 0) {
    return message.error(t("請先關閉伺服器"));
  }
  isVisible.value = true;
  if (mcVersions.value.length === 0) fetchMCVersions();
};

/** * 1. 獲取 Minecraft 版本列表 (從 Mojang 或 Fabric API)
 */
const fetchMCVersions = async () => {
  try {
    const res = await axios.get("https://meta.fabricmc.net/v2/versions/game");
    // 只取穩定的發行版，過濾掉快照版
    mcVersions.value = res.data.filter((v: any) => v.stable).map((v: any) => v.version);
  } catch (err) {
    message.error("獲取版本清單失敗");
  }
};

/**
 * 2. 根據選擇獲取 Loader 版本
 */
const fetchLoaderVersions = async () => {
  if (!form.mcVersion || !form.loaderType) return;
  
  loadingVersions.value = true;
  loaderVersions.value = [];
  form.loaderVersion = "";

  try {
    let url = "";
    if (form.loaderType === "fabric") {
      url = `https://meta.fabricmc.net/v2/versions/loader/${form.mcVersion}`;
      const res = await axios.get(url);
      loaderVersions.value = res.data.map((v: any) => v.loader.version);
    } 
    else if (form.loaderType === "quilt") {
      url = `https://meta.quiltmc.org/v3/versions/loader/${form.mcVersion}`;
      const res = await axios.get(url);
      loaderVersions.value = res.data.map((v: any) => v.loader.version);
    }
    else if (form.loaderType === "forge") {
      // Forge 比較特殊，通常從檔案伺服器抓，這裡使用常用的清單 API
      url = `https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json`;
      const res = await axios.get(url);
      // 這裡簡單處理：獲取該 MC 版本的所有版本，或使用推廣版本
      // 注意：Forge API 結構較複雜，實務上建議由後端處理後回傳
      loaderVersions.value = Object.keys(res.data.promos)
        .filter(k => k.includes(form.mcVersion))
        .map(k => res.data.promos[k]);
    }
    else if (form.loaderType === "neoforge") {
      url = `https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge`;
      // NeoForge 建議直接抓 Maven 數據，這裡示範邏輯
      loaderVersions.value = ["latest"]; // 簡化處理
    }
    
    if (loaderVersions.value.length > 0) form.loaderVersion = loaderVersions.value[0];
  } catch (err) {
    message.error("無法載入對應的 ModLoader 版本");
  } finally {
    loadingVersions.value = false;
  }
};

// 監聽變動自動抓取
watch(() => [form.mcVersion, form.loaderType], () => {
  fetchLoaderVersions();
});

/**
 * 3. 提交安裝任務
 * 這裡會對接你提供的 Bash 腳本所需要的參數
 */
const handleInstall = async () => {
  Modal.confirm({
    title: t("確認安裝自定義版本？"),
    content: `${form.loaderType} - ${form.mcVersion} (${form.loaderVersion})`,
    onOk: async () => {
      try {
        confirmLoading.value = true;
        // 呼叫 API 傳遞給後端，後端再執行你那段 Bash
        await installModLoader().execute({
          params: { daemonId: props.daemonId, uuid: props.instanceId },
          data: {
            MINECRAFT_VERSION: form.mcVersion,
            LOADER_TYPE: form.loaderType,
            LOADER_VERSION: form.loaderVersion
          }
        });
        message.success(t("安裝任務已發送到後端執行"));
        isVisible.value = false;
      } catch (err: any) {
        message.error(err.message);
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
    :width="550"
  >
    <div class="install-container">
      <div class="step-card" :class="hasCleaned ? 'success-zone' : 'danger-zone'">
        <div class="step-title">
          <delete-outlined /> {{ t('1. 環境清理') }}
        </div>
        <div class="mt-2 flex-between">
          <a-checkbox v-model:checked="agreeClean" :disabled="hasCleaned">
            {{ t('我明白安裝新環境會覆蓋現有檔案') }}
          </a-checkbox>
          <a-button danger size="small" :disabled="!agreeClean || hasCleaned" @click="hasCleaned = true">
            {{ hasCleaned ? t('已就緒') : t('標記為乾淨環境') }}
          </a-button>
        </div>
      </div>

      <div class="step-card config-zone" :class="{ 'is-locked': !hasCleaned }">
        <div class="step-title"><setting-outlined /> {{ t('2. 版本選擇') }}</div>
        
        <a-form layout="vertical" class="mt-4">
          <a-form-item :label="t('Minecraft 版本')">
            <a-select v-model:value="form.mcVersion" show-search placeholder="請選擇版本">
              <a-select-option v-for="v in mcVersions" :key="v" :value="v">{{ v }}</a-select-option>
            </a-select>
          </a-form-item>

          <a-form-item :label="t('Mod 加載器類型')">
            <a-radio-group v-model:value="form.loaderType" button-style="solid" class="w-full">
              <a-radio-button value="forge">Forge</a-radio-button>
              <a-radio-button value="neoforge">NeoForge</a-radio-button>
              <a-radio-button value="fabric">Fabric</a-radio-button>
              <a-radio-button value="quilt">Quilt</a-radio-button>
            </a-radio-group>
          </a-form-item>

          <a-form-item :label="t('加載器版本 (Loader Version)')">
            <a-select 
              v-model:value="form.loaderVersion" 
              :loading="loadingVersions"
              placeholder="請先選擇 MC 版本"
            >
              <a-select-option v-for="v in loaderVersions" :key="v" :value="v">{{ v }}</a-select-option>
            </a-select>
          </a-form-item>

          <div class="footer-actions">
            <a-button @click="isVisible = false">{{ t('取消') }}</a-button>
            <a-button 
              type="primary" 
              :loading="confirmLoading"
              :disabled="!form.loaderVersion || !hasCleaned"
              @click="handleInstall"
            >
              <template #icon><thunderbolt-outlined /></template>
              {{ t('開始執行安裝腳本') }}
            </a-button>
          </div>
        </a-form>
      </div>
    </div>
  </a-modal>
</template>

<style scoped>
.install-container { display: flex; flex-direction: column; gap: 16px; padding: 10px 0; }
.step-card { border-radius: 10px; padding: 16px; border: 1px solid #eee; }
.step-title { font-weight: bold; font-size: 16px; display: flex; align-items: center; gap: 8px; }
.danger-zone { background: #fff1f0; border-color: #ffa39e; }
.success-zone { background: #f6ffed; border-color: #b7eb8f; }
.config-zone { background: #f0f5ff; border-color: #adc6ff; }
.is-locked { opacity: 0.5; pointer-events: none; filter: grayscale(1); }
.flex-between { display: flex; justify-content: space-between; align-items: center; }
.w-full { width: 100%; display: flex; }
.w-full > * { flex: 1; text-align: center; }
.footer-actions { margin-top: 20px; display: flex; justify-content: flex-end; gap: 10px; }
</style>
