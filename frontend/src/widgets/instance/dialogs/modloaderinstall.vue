<script setup lang="ts">
import { ref, reactive, watch } from "vue";
import { message, Modal } from "ant-design-vue";
import { 
  CloudDownloadOutlined, 
  CheckCircleOutlined
} from "@ant-design/icons-vue";
import axios from "axios";
import { fileList, deleteFile } from "@/services/apis/fileManager";
import { installModLoader } from "@/services/apis/instance";

// --- 配置區 ---
const PROXY = "https://get-modloader-version.lazycloud.one/?url=";

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

// MCSManager 內建 API 執行器
const { execute: fetchFileList } = fileList();
const { execute: executeDelete } = deleteFile();

/**
 * 封裝代理請求工具
 */
const proxyGet = async (targetUrl: string) => {
  const res = await axios.get(PROXY + encodeURIComponent(targetUrl));
  return res.data;
};

/**
 * 打開彈窗並初始化 Minecraft 版本列表
 */
const openDialog = async () => {
  if (props.instanceInfo.status !== 0) {
    return message.error("請先關閉伺服器再進行安裝");
  }
  isVisible.value = true;
  
  try {
    const data = await proxyGet("https://bmclapi2.bangbang93.com/mc/game/version_manifest_v2.json");
    mcVersions.value = data.versions
      .filter((v: any) => v.type === "release")
      .map((v: any) => v.id);
  } catch (err) {
    message.error("獲取 Minecraft 版本清單失敗");
  }
};

/**
 * 監聽選擇變化，自動獲取對應的 Loader 版本
 */
watch([() => form.mcVersion, () => form.loaderType], async ([newMc, newType]) => {
  if (!newMc || !newType) {
    loaderVersions.value = [];
    form.loaderVersion = "";
    return;
  }
  
  loadingLoaders.value = true;
  const tempVersions: {version: string, tag?: string}[] = [];

  try {
    let target = "";
    if (newType === "forge") {
      target = `https://bmclapi2.bangbang93.com/forge/minecraft/${newMc}`;
      const data = await proxyGet(target);
      if (Array.isArray(data)) {
        data.reverse().slice(0, 15).forEach((v: any) => {
          tempVersions.push({ 
            version: v.version, 
            tag: v.category === "recommended" ? "⭐" : "" 
          });
        });
      }
    } 
    else if (newType === "neoforge") {
      target = `https://bmclapi2.bangbang93.com/neoforge/list/${newMc}`;
      const data = await proxyGet(target);
      if (Array.isArray(data)) {
        data.reverse().slice(0, 15).forEach((v: any) => {
          const vStr = typeof v === 'string' ? v : (v.version || JSON.stringify(v));
          tempVersions.push({ version: vStr, tag: "" });
        });
      }
    } 
    else if (newType === "fabric") {
      target = `https://meta.fabricmc.net/v2/versions/loader/${newMc}`;
      const data = await proxyGet(target);
      if (Array.isArray(data)) {
        data.slice(0, 10).forEach((v: any) => {
          tempVersions.push({ 
            version: v.loader.version, 
            tag: v.loader.stable ? "" : "[測試版]" 
          });
        });
      }
    }

    form.loaderVersion = ""; 
    loaderVersions.value = tempVersions;
  } catch (err) {
    console.error("Loader Fetch Error:", err);
    loaderVersions.value = [];
  } finally {
    loadingLoaders.value = false;
  }
});

/**
 * 環境清理邏輯
 */
const handleCleanServer = async () => {
  Modal.confirm({
    title: "確定要清空伺服器嗎？",
    content: "這將刪除除 LazyCloud_backup 外的所有檔案，請確認已備份！",
    okText: "確認刪除",
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
            page_size: 100,
            file_name: "" 
          }
        });
        
        const items = res.value?.items || [];
        const targets = items
          .filter((i: any) => i.name !== "LazyCloud_backup")
          .map((i: any) => "/" + i.name);

        if (targets.length > 0) {
          await executeDelete({
            params: { daemonId: props.daemonId, uuid: props.instanceId },
            data: { targets }
          });
        }
        
        message.success("環境清理完成");
        hasCleaned.value = true;
      } catch (err) {
        message.error("清理失敗");
      } finally {
        isCleaning.value = false;
      }
    }
  });
};

/**
 * 提交安裝任務（強化數據傳遞版）
 */

  const handleInstall = async () => {
  const mcV = String(form.mcVersion).trim();
  const lT = String(form.loaderType).trim();
  const lV = String(form.loaderVersion).trim();

  confirmLoading.value = true;
  try {
    await installModLoader().execute({
      params: {
        daemonId: props.daemonId,
        uuid: props.instanceId,
        task_name: "modloader_install"
      },
      data: {
        instanceUuid: props.instanceId,
        taskName: "modloader_install",
        // 直接寫在這裡，不包 parameter
        mcVersion: mcV,
        loaderType: lT,
        loaderVersion: lV
      }
    });

    message.success("安裝任務已啟動，請觀察控制台日誌");
    isVisible.value = false;
  } catch (err: any) {
    console.error("安裝請求失敗:", err);
    message.error("啟動失敗：" + (err.response?.data?.err || err.message));
  } finally {
    confirmLoading.value = false;
  }
};

defineExpose({ openDialog });
</script>

<template>
  <a-modal
    v-model:open="isVisible"
    centered
    :title="null"
    :footer="null"
    :mask-closable="false"
    destroy-on-close
    :width="520"
  >
    <div class="install-container">
      <div class="header-banner">
        <cloud-download-outlined class="banner-icon" />
        <div class="banner-text">
          <h3>自動化核心安裝</h3>
          <p>由 LazyCloud 提供的自動化運行環境部署工具</p>
        </div>
      </div>

      <div class="step-card danger-zone">
        <div class="card-header">
          <div class="header-content">
            <h4 class="step-title danger">
              <delete-outlined /> 第一步：環境清理
            </h4>
            <p class="step-desc">為確保安裝過程無核心衝突，強烈建議清空目前的實例檔案。</p>
          </div>
          <transition name="fade">
            <a-tag v-if="hasCleaned" color="success" class="status-tag">
              <check-circle-outlined /> 已完成
            </a-tag>
          </transition>
        </div>

        <div class="card-action">
          <a-checkbox v-model:checked="agreeClean" :disabled="hasCleaned" class="custom-checkbox">
            <span class="checkbox-text">我同意清空檔案（LazyCloud_backup 除外）</span>
          </a-checkbox>
          <a-button 
            danger 
            block
            :loading="isCleaning"
            :disabled="!agreeClean || hasCleaned"
            class="action-btn"
            @click="handleCleanServer"
          >
            {{ hasCleaned ? '伺服器已處於乾淨狀態' : '立即執行環境清空' }}
          </a-button>
        </div>
      </div>

      <div class="step-card config-zone" :class="{ 'is-locked': !hasCleaned }">
        <h4 class="step-title">
          <setting-outlined /> 第二步：運行環境配置
        </h4>
        <p class="step-desc">請選擇您希望安裝的 Minecraft 版本與核心加載器。</p>
        
        <a-form layout="vertical" class="mt-4">
          <a-form-item label="Minecraft 版本">
            <a-select v-model:value="form.mcVersion" show-search placeholder="請選擇版本">
              <template #prefix><block-outlined /></template>
              <a-select-option v-for="v in mcVersions" :key="v" :value="v">{{ v }}</a-select-option>
            </a-select>
          </a-form-item>

          <a-row :gutter="12">
            <a-col :span="10">
              <a-form-item label="核心類型">
                <a-select v-model:value="form.loaderType">
                  <a-select-option value="forge">Forge</a-select-option>
                  <a-select-option value="neoforge">NeoForge</a-select-option>
                  <a-select-option value="fabric">Fabric</a-select-option>
                </a-select>
              </a-form-item>
            </a-col>
            <a-col :span="14">
              <a-form-item label="核心版本">
                <a-select v-model:value="form.loaderVersion" :loading="loadingLoaders" placeholder="請先選擇遊戲版本">
                  <a-select-option v-for="l in loaderVersions" :key="l.version" :value="l.version">
                    {{ l.version }} <small style="color: #888">{{ l.tag }}</small>
                  </a-select-option>
                </a-select>
              </a-form-item>
            </a-col>
          </a-row>

          <div class="footer-actions">
            <a-button @click="isVisible = false">取消</a-button>
            <a-button 
              type="primary" 
              :loading="confirmLoading" 
              :disabled="!hasCleaned || !form.loaderVersion"
              class="submit-btn"
              @click="handleInstall"
            >
              <template #icon><cloud-download-outlined /></template>
              {{ hasCleaned ? '開始安裝任務' : '請先完成第一步' }}
            </a-button>
          </div>
        </a-form>
      </div>
    </div>
  </a-modal>
</template>

<style scoped>
.install-container { padding: 4px 0; display: flex; flex-direction: column; gap: 16px; }

/* 頂部橫幅 */
.header-banner {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 8px 8px 8px;
}
.banner-icon { font-size: 32px; color: #1677ff; }
.banner-text h3 { margin: 0; font-weight: 600; font-size: 18px; }
.banner-text p { margin: 0; font-size: 12px; color: #8c8c8c; }

/* 通用卡片 */
.step-card {
  border-radius: 12px;
  padding: 16px;
  border: 1px solid rgba(140, 140, 140, 0.15);
  transition: all 0.3s ease;
}

.card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }

.step-title {
  font-weight: 600;
  font-size: 15px;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.step-desc { font-size: 12px; opacity: 0.6; margin: 0; line-height: 1.5; }

/* 危險區域樣式 */
.danger-zone { background: rgba(255, 77, 79, 0.04); border-color: rgba(255, 77, 79, 0.15); }
.danger-zone .danger { color: #ff4d4f; }

.card-action { display: flex; flex-direction: column; gap: 12px; margin-top: 12px; }
.checkbox-text { font-size: 12px; }

/* 配置區域樣式 */
.config-zone { background: rgba(22, 119, 255, 0.04); border-color: rgba(22, 119, 255, 0.15); }
.config-zone.is-locked { opacity: 0.4; filter: grayscale(0.5); pointer-events: none; }

.footer-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.submit-btn { min-width: 140px; font-weight: 500; border-radius: 6px; }

.status-tag { border-radius: 6px; }

.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

:deep(.ant-form-item) { margin-bottom: 12px; }
:deep(.ant-select-selector), :deep(.ant-input) { border-radius: 6px !important; }
</style>
