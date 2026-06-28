<script setup lang="ts">
import { ref, reactive, watch, computed } from "vue";
import { message, Modal } from "ant-design-vue";
import {
  CloudDownloadOutlined,
  CheckCircleOutlined,
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
const isDeleting = ref(false);
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

const agreeDelete = ref(false);
const agreeBackup = ref(false);
const agreeCompatibility = ref(false);

const isSimpleServer = computed(() => {
  return ["paper", "folia", "vanilla"].includes(form.loaderType);
});

const allAgreed = computed(() => {
  return agreeDelete.value && agreeBackup.value && agreeCompatibility.value;
});

const { execute: fetchFileList } = fileList();
const { execute: executeDelete } = deleteFile();

const proxyGet = async (targetUrl: string) => {
  const res = await axios.get(PROXY + encodeURIComponent(targetUrl));
  return res.data;
};

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

const openDialog = async () => {
  if (props.instanceInfo.status !== 0) {
    return message.error("請先關閉伺服器再進行升級");
  }
  isVisible.value = true;
  agreeDelete.value = false;
  agreeBackup.value = false;
  agreeCompatibility.value = false;
  isModServer.value = false;
  baseVersion.value = null;
  checkingModServer.value = true;

  try {
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

    const rootRes = await fetchFileList({
      params: {
        daemonId: props.daemonId,
        uuid: props.instanceId,
        target: "/",
        page: 0,
        page_size: 100,
        file_name: ""
      }
    });
    const rootItems = rootRes.value?.items || [];

    const hasRunOrJvm = rootItems.some(
      (item: any) =>
        (item.name === "run.sh" || item.name === "user_jvm_args.txt") && item.type === "file"
    );
    if (hasRunOrJvm) {
      isModServer.value = true;
    }

    // 尋找 versions 目錄（小寫），讀取內部子目錄作為基底版本
    const versionDir = rootItems.find(
      (item: any) => item.name === "versions" && item.type === "dir"
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
});

const handleUpgrade = async () => {
  if (!form.mcVersion) {
    message.warning("請選擇 Minecraft 版本");
    return;
  }
  if (!allAgreed.value) {
    message.warning("請勾選所有確認項目");
    return;
  }

  confirmLoading.value = true;
  isDeleting.value = true;

  try {
    const targets = ["/startmc.jar", "/libraries", "/versions"];
    await executeDelete({
      params: { daemonId: props.daemonId, uuid: props.instanceId },
      data: { targets }
    });
    message.success("舊核心檔案清理成功");
    isDeleting.value = false;

    const mcV = String(form.mcVersion).trim();
    const lT = String(form.loaderType).trim();
    const lV = isSimpleServer.value ? "NA" : String(form.loaderVersion).trim();

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
    console.error("升級流程失敗:", err);
    message.error("升級失敗：" + (err.response?.data?.err || err.message));
  } finally {
    confirmLoading.value = false;
    isDeleting.value = false;
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

      <div class="step-card config-zone" :class="{ 'is-locked': isModServer }">
        <div class="card-header">
          <h4 class="step-title">
            <check-circle-outlined /> 升級前確認事項
          </h4>
        </div>
        <div class="checklist">
          <a-checkbox v-model:checked="agreeDelete" :disabled="isModServer">
            我同意刪除舊 Server Core 檔案（startmc.jar、libraries、versions）
          </a-checkbox>
          <a-checkbox v-model:checked="agreeBackup" :disabled="isModServer">
            我已進行備份（強烈建議備份）
          </a-checkbox>
          <a-checkbox v-model:checked="agreeCompatibility" :disabled="isModServer">
            我清楚升級伺服器核心可能導致存檔及插件等出現相容性問題
          </a-checkbox>
        </div>
      </div>

      <div class="step-card config-zone" :class="{ 'is-locked': !allAgreed || isModServer }">
        <div class="step-header-row">
          <h4 class="step-title">
            <setting-outlined /> 選擇 Server Core
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
              :disabled="!allAgreed || !form.mcVersion || isModServer || isDeleting"
              class="submit-btn"
              @click="handleUpgrade"
            >
              <template #icon><cloud-download-outlined /></template>
              {{ isDeleting ? '正在清理舊檔案...' : '開始升級任務' }}
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
.checklist {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 8px;
}
.config-zone { background: rgba(22, 119, 255, 0.04); border-color: rgba(22, 119, 255, 0.15); }
.config-zone.is-locked { opacity: 0.4; filter: grayscale(0.5); pointer-events: none; }
.footer-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.submit-btn { min-width: 140px; font-weight: 500; border-radius: 6px; }
:deep(.ant-form-item) { margin-bottom: 12px; }
:deep(.ant-select-selector), :deep(.ant-input) { border-radius: 6px !important; }

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
