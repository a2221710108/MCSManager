<script setup lang="ts">
import { ref, reactive, watch, computed } from "vue";
import { message, Modal } from "ant-design-vue";
import {
  CloudDownloadOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  SettingOutlined
} from "@ant-design/icons-vue";
import axios from "axios";
import { fileList, deleteFile } from "@/services/apis/fileManager";
import { installModLoader } from "@/services/apis/instance";

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
const showSnapshots = ref(false);
const isModServer = ref(false);
const checkingModServer = ref(false);
const baseVersion = ref<string | null>(null);

const mcVersions = ref<string[]>([]);
const loaderVersions = ref<{ version: string; tag?: string }[]>([]);
const loadingLoaders = ref(false);

const form = reactive({
  mcVersion: "",
  loaderType: "paper",
  loaderVersion: ""
});

const isSimpleServer = computed(() => {
  return ["paper", "folia", "vanilla"].includes(form.loaderType);
});

const { execute: fetchFileList } = fileList();
const { execute: executeDelete } = deleteFile();

const proxyGet = async (targetUrl: string) => {
  const res = await axios.get(PROXY + encodeURIComponent(targetUrl));
  return res.data;
};

// 獲取 Minecraft 版本清單並根據基底版本過濾
const fetchMcVersions = async () => {
  try {
    const data = await proxyGet("https://bmclapi2.bangbang93.com/mc/game/version_manifest_v2.json");
    let versions: string[] = [];

    if (showSnapshots.value) {
      let snapshotCount = 0;
      for (const v of data.versions) {
        if (v.type === "release") {
          versions.push(v.id);
        } else if (v.type === "snapshot" && snapshotCount < 30) {
          versions.push(v.id);
          snapshotCount++;
        }
      }
    } else {
      versions = data.versions
        .filter((v: any) => v.type === "release")
        .map((v: any) => v.id);
    }

    // 如果有基底版本，過濾僅保留 >= baseVersion 的版本
    if (baseVersion.value) {
      versions = versions.filter(v => {
        return v.localeCompare(baseVersion.value!, undefined, { numeric: true, sensitivity: 'base' }) >= 0;
      });
    }

    mcVersions.value = versions;
  } catch (err) {
    message.error("獲取 Minecraft 版本清單失敗");
  }
};

// 打開視窗時的全盤檢查
const openDialog = async () => {
  if (props.instanceInfo.status !== 0) {
    return message.error("請先關閉伺服器再進行升級");
  }
  isVisible.value = true;
  hasCleaned.value = false;
  isModServer.value = false;
  baseVersion.value = null;
  checkingModServer.value = true;

  try {
    // 1. 檢查 libraries/net 下的模組目錄
    const libRes = await fetchFileList({
      params: {
        daemonId: props.daemonId,
        uuid: props.instanceId,
        target: "/libraries/net",
        page: 0,
        page_size: 100,
        file_name: ""
      }
    });
    const libItems = libRes.value?.items || [];
    const modFolders = ["minecraftforge", "neoforged", "fabricmc", "forge"];
    const hasModFolder = libItems.some((item: any) => modFolders.includes(item.name));

    if (hasModFolder) {
      isModServer.value = true;
    }

    // 2. 檢查根目錄特殊檔案與 Version 目錄
    const rootRes = await fetchFileList({
      params: {
        daemonId: props.daemonId,
        uuid: props.instanceId,
        target: "/",
        page: 0,
        page_size: 200,
        file_name: ""
      }
    });
    const rootItems = rootRes.value?.items || [];

    // 檢查 run.sh 或 user_jvm_args.txt 是否存在（需為檔案）
    const hasRunOrJvm = rootItems.some(
      (item: any) =>
        (item.name === "run.sh" || item.name === "user_jvm_args.txt") && item.type === "file"
    );
    if (hasRunOrJvm) {
      isModServer.value = true;
    }

    // 檢查是否有 Version 目錄，並讀取其內部版本號
    const versionDir = rootItems.find(
      (item: any) => item.name === "Version" && item.type === "dir"
    );
    if (versionDir) {
      try {
        const versionRes = await fetchFileList({
          params: {
            daemonId: props.daemonId,
            uuid: props.instanceId,
            target: "/versions",
            page: 0,
            page_size: 100,
            file_name: ""
          }
        });
        const versionItems = versionRes.value?.items || [];
        const versionSubDir = versionItems.find(
          (item: any) => item.type === "dir"
        );
        if (versionSubDir) {
          baseVersion.value = versionSubDir.name;
        }
      } catch (e) {
        // 忽略讀取錯誤
      }
    }

  } catch (e) {
    isModServer.value = false;
  } finally {
    checkingModServer.value = false;
  }

  if (!isModServer.value) {
    await fetchMcVersions();
  } else {
    mcVersions.value = [];
  }
};

watch(showSnapshots, () => {
  fetchMcVersions();
});

watch([() => form.mcVersion, () => form.loaderType], async ([newMc, newType]) => {
  if (!newMc || !newType) {
    loaderVersions.value = [];
    form.loaderVersion = "";
    return;
  }
  if (isSimpleServer.value) {
    loaderVersions.value = [];
    form.loaderVersion = "";
    loadingLoaders.value = false;
    return;
  }
  loadingLoaders.value = true;
  // 原 loader 獲取邏輯保留但不會執行，此處省略
  loadingLoaders.value = false;
});

const handleCleanServer = async () => {
  Modal.confirm({
    title: "確定要清理舊核心檔案嗎？",
    content: "將刪除 startmc.jar 及 libraries 資料夾，請確認已備份重要檔案！",
    okText: "確認清理",
    okType: "danger",
    onOk: async () => {
      try {
        isCleaning.value = true;
        const targets = ["/startmc.jar", "/libraries", "/versions"];
        await executeDelete({
          params: { daemonId: props.daemonId, uuid: props.instanceId },
          data: { targets }
        });
        message.success("已清理舊核心檔案");
        hasCleaned.value = true;
      } catch (err) {
        message.error("清理失敗");
      } finally {
        isCleaning.value = false;
      }
    }
  });
};

const handleInstall = async () => {
  const mcV = String(form.mcVersion).trim();
  const lT = String(form.loaderType).trim();
  const lV = isSimpleServer.value ? "NA" : String(form.loaderVersion).trim();

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
        mcVersion: mcV,
        loaderType: lT,
        loaderVersion: lV
      }
    });
    message.success("升級任務已啟動");
    isVisible.value = false;
  } catch (err: any) {
    console.error("升級請求失敗:", err);
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
      <!-- 模組伺服器遮罩層 -->
      <div v-if="isModServer" class="mod-server-overlay">
        <a-alert
          type="error"
          message="不支持Mod伺服器一鍵升級"
          show-icon
          banner
        />
      </div>

      <div class="header-banner">
        <cloud-download-outlined class="banner-icon" />
        <div class="banner-text">
          <h3>Server Core 自動化升級</h3>
          <p>升級 Minecraft 版本與 Server Core，支援 Paper / Folia / Vanilla</p>
        </div>
      </div>

      <!-- 第一步：清理舊核心 -->
      <div class="step-card danger-zone">
        <div class="card-header">
          <div class="header-content">
            <h4 class="step-title danger">
              <delete-outlined /> 第一步：清理舊核心檔案
            </h4>
            <p class="step-desc">為確保版本相容，將刪除 startmc.jar 與 libraries 資料夾</p>
          </div>
          <transition name="fade">
            <a-tag v-if="hasCleaned" color="success" class="status-tag">
              <check-circle-outlined /> 已完成
            </a-tag>
          </transition>
        </div>
        <div class="card-action">
          <a-checkbox v-model:checked="agreeClean" :disabled="hasCleaned || isModServer" class="custom-checkbox">
            <span class="checkbox-text">我同意清理上述檔案</span>
          </a-checkbox>
          <a-button
            danger
            block
            :loading="isCleaning"
            :disabled="!agreeClean || hasCleaned || isModServer"
            class="action-btn"
            @click="handleCleanServer"
          >
            {{ hasCleaned ? '舊核心已清理完畢' : '立即執行清理' }}
          </a-button>
        </div>
      </div>

      <!-- 第二步：選擇 Server Core -->
      <div class="step-card config-zone" :class="{ 'is-locked': !hasCleaned || isModServer }">
        <div class="step-header-row">
          <h4 class="step-title">
            <setting-outlined /> 第二步：選擇 Server Core
          </h4>
          <a-checkbox v-model:checked="showSnapshots" class="snapshot-checkbox">
            顯示最近的快照版本
          </a-checkbox>
        </div>
        <p class="step-desc">請選擇您希望升級的 Minecraft 版本與 Server Core 類型</p>
        <a-form layout="vertical" class="mt-4">
          <a-form-item label="Minecraft 版本">
            <a-select v-model:value="form.mcVersion" show-search placeholder="請選擇版本">
              <a-select-option v-for="v in mcVersions" :key="v" :value="v">{{ v }}</a-select-option>
            </a-select>
          </a-form-item>

          <a-form-item label="Server Core 類型">
            <a-select v-model:value="form.loaderType">
              <a-select-option value="paper">
                <img src="https://www.lazycloud.one/wp-content/uploads/2026/06/paper.png" alt="paper" style="width:14px; height:14px; margin-right:6px; vertical-align:middle;" /> Paper
              </a-select-option>
              <a-select-option value="folia">
                <img src="https://www.lazycloud.one/wp-content/uploads/2026/06/folia.png" alt="folia" style="width:14px; height:14px; margin-right:6px; vertical-align:middle;" /> Folia
              </a-select-option>
              <a-select-option value="vanilla">
                <img src="https://www.lazycloud.one/wp-content/uploads/2026/06/minecraft.png" alt="vanilla" style="width:14px; height:14px; margin-right:6px; vertical-align:middle;" /> Vanilla
              </a-select-option>
            </a-select>
          </a-form-item>

          <div class="footer-actions">
            <a-button @click="isVisible = false">取消</a-button>
            <a-button
              type="primary"
              :loading="confirmLoading"
              :disabled="!hasCleaned || !form.mcVersion || isModServer"
              class="submit-btn"
              @click="handleInstall"
            >
              <template #icon><cloud-download-outlined /></template>
              開始升級任務
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
  position: relative;
}
.header-banner {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 8px 8px 8px;
}
.banner-icon { font-size: 32px; color: #1677ff; }
.banner-text h3 { margin: 0; font-weight: 600; font-size: 18px; }
.banner-text p { margin: 0; font-size: 12px; color: #8c8c8c; }
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
.step-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.step-header-row .step-title { margin-bottom: 0; }
.snapshot-checkbox { font-size: 12px; }
.danger-zone { background: rgba(255, 77, 79, 0.04); border-color: rgba(255, 77, 79, 0.15); }
.danger-zone .danger { color: #ff4d4f; }
.card-action { display: flex; flex-direction: column; gap: 12px; margin-top: 12px; }
.checkbox-text { font-size: 12px; }
.config-zone { background: rgba(22, 119, 255, 0.04); border-color: rgba(22, 119, 255, 0.15); }
.config-zone.is-locked { opacity: 0.4; filter: grayscale(0.5); pointer-events: none; }
.footer-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.submit-btn { min-width: 140px; font-weight: 500; border-radius: 6px; }
.status-tag { border-radius: 6px; }
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
:deep(.ant-form-item) { margin-bottom: 12px; }
:deep(.ant-select-selector), :deep(.ant-input) { border-radius: 6px !important; }

/* 模組伺服器遮罩層 */
.mod-server-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 10;
  border-radius: 12px;
}
.mod-server-overlay .ant-alert {
  max-width: 90%;
}
</style>
