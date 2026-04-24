<script setup lang="ts">
import { ref, reactive, watch, onMounted } from "vue";
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

// --- 配置區 ---
// 請替換成你部署的 Cloudflare Worker 地址（記得保留最後的 ?url=）
const PROXY = "https://get-modloader-version.leolu55165088.workers.dev/?url=";

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

// MCSManager 內建的文件操作 API
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
    message.error("獲取 Minecraft 版本清單失敗，請檢查 Worker 配置");
  }
};

/**
 * 監聽選擇變化，自動獲取對應的 Loader 版本
 */
/**
 * 監聽選擇變化，自動獲取對應的 Loader 版本
 */
watch([() => form.mcVersion, () => form.loaderType], async ([newMc, newType]) => {
  if (!newMc || !newType) return;
  
  loadingLoaders.value = true;
  form.loaderVersion = ""; 
  loaderVersions.value = [];

  try {
    let target = "";
    if (newType === "forge") {
      // Forge 邏輯
      target = `https://bmclapi2.bangbang93.com/forge/minecraft/${newMc}`;
      const data = await proxyGet(target);
      // Forge API 返回的是列表，我們將其倒序排列
      loaderVersions.value = data
        .map((v: any) => ({ 
          version: v.version, 
          tag: v.category === "recommended" ? "⭐ 推薦" : "" 
        }))
        .reverse() // 最新在前
        .slice(0, 40); // Forge 版本較多，可以保留稍微多一點

    } else if (newType === "neoforge") {
      // NeoForge 邏輯
      target = `https://bmclapi2.bangbang93.com/neoforge/list/${newMc}`;
      const data = await proxyGet(target);
      // NeoForge 返回的是字符串數組 ["20.1.1", "20.1.2"]
      loaderVersions.value = data
        .map((v: string) => ({ version: v, tag: "" }))
        .reverse() // 最新在前
        .slice(0, 40);

    } else if (newType === "fabric") {
      // Fabric 邏輯
      target = `https://meta.fabricmc.net/v2/versions/loader/${newMc}`;
      const data = await proxyGet(target);
      // 根據你的需求：取最後 10 個版本，最新的排最前面
      // Fabric API 通常已經是按時間排序，我們確保它是倒序後取前 10
      loaderVersions.value = data
        .map((v: any) => ({ 
          version: v.loader.version, 
          tag: v.loader.stable ? "" : "測試版" 
        }))
        .slice(0, 40); // 取前 10 個（最新）
    }
  } catch (err) {
    console.error("獲取 Loader 失敗:", err);
    message.warning("該版本下暫無可用的 ModLoader");
  } finally {
    loadingLoaders.value = false;
  }
});
/**
 * 執行清空伺服器邏輯
 */
const handleCleanServer = async () => {
  Modal.confirm({
    title: "確定要清空伺服器嗎？",
    content: "這將刪除實例目錄下的所有檔案（LazyCloud_backup 除外），請務必確認已備份重要地圖！",
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
    // 加上下面這一行，解決 TS2345 錯誤
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
        message.error("清理失敗，請檢查權限");
      } finally {
        isCleaning.value = false;
      }
    }
  });
};

/**
 * 提交安裝任務給 MCSM 後端
 */
const handleInstall = async () => {
  if (!form.loaderVersion) return message.warning("請先選擇版本");

  confirmLoading.value = true;
  try {
    // 這裡調用 MCSM 原有的異步任務接口
    await axios.post(`/api/protected/daemon/instance/asynchronous`, {
      daemonId: props.daemonId,
      instanceUuid: props.instanceId,
      taskName: "modloader_install", // 這裡對應你未來在 Daemon 寫的安裝邏輯
      parameter: {
        mcVersion: form.mcVersion,
        loaderType: form.loaderType,
        loaderVersion: form.loaderVersion
      }
    });

    message.success("安裝指令已發送至伺服器");
    isVisible.value = false;
  } catch (err: any) {
    message.error("啟動安裝失敗：" + err.message);
  } finally {
    confirmLoading.value = false;
  }
};

defineExpose({ openDialog });
</script>

<template>
  <a-modal
    v-model:open="isVisible"
    :title="null"
    :footer="null"
    :width="500"
    centered
    destroy-on-close
  >
    <div class="install-wrapper">
      <div class="header-section">
        <cloud-download-outlined class="main-icon" />
        <h3>自動化核心安裝</h3>
        <p>為您的 LazyCloud 實例一鍵部署運行環境</p>
      </div>

      <div class="step-box danger-box">
        <div class="step-info">
          <span class="step-num">1</span>
          <div class="text">
            <div class="t">環境初始化</div>
            <div class="d">刪除現有檔案以避免衝突</div>
          </div>
          <a-tag v-if="hasCleaned" color="success"><check-circle-outlined /> 已完成</a-tag>
        </div>
        <div class="step-ctrl">
          <a-checkbox v-model:checked="agreeClean" :disabled="hasCleaned">我已備份地圖等重要數據</a-checkbox>
          <a-button 
            danger 
            block 
            :loading="isCleaning"
            :disabled="!agreeClean || hasCleaned"
            @click="handleCleanServer"
          >
            {{ hasCleaned ? '清理成功' : '立即清空伺服器' }}
          </a-button>
        </div>
      </div>

      <div class="step-box" :class="{ 'is-locked': !hasCleaned }">
        <div class="step-info">
          <span class="step-num">2</span>
          <div class="text">
            <div class="t">版本配置</div>
            <div class="d">選擇您想要的 MC 版本與加載器</div>
          </div>
        </div>
        
        <div class="form-content">
          <div class="f-item">
            <label>Minecraft 版本</label>
            <a-select v-model:value="form.mcVersion" show-search placeholder="請選擇版本">
              <a-select-option v-for="v in mcVersions" :key="v" :value="v">{{ v }}</a-select-option>
            </a-select>
          </div>

          <div class="f-group">
            <div class="f-item">
              <label>類型</label>
              <a-select v-model:value="form.loaderType">
  <a-select-option value="forge">Forge</a-select-option>
  <a-select-option value="neoforge">NeoForge</a-select-option>
  <a-select-option value="fabric">Fabric</a-select-option>
</a-select>
            </div>
            <div class="f-item" style="flex: 2">
              <label>Loader 版本</label>
              <a-select v-model:value="form.loaderVersion" :loading="loadingLoaders" placeholder="選擇版本">
                <a-select-option v-for="l in loaderVersions" :key="l.version" :value="l.version">
                  {{ l.version }} <small style="color: #888">{{ l.tag }}</small>
                </a-select-option>
              </a-select>
            </div>
          </div>
        </div>

        <a-button 
          type="primary" 
          block 
          size="large"
          class="install-btn"
          :loading="confirmLoading"
          :disabled="!form.loaderVersion"
          @click="handleInstall"
        >
          開始安裝
        </a-button>
      </div>
    </div>
  </a-modal>
</template>

<style scoped>
.install-wrapper { padding: 10px; }
.header-section { text-align: center; margin-bottom: 24px; }
.main-icon { font-size: 48px; color: #1890ff; margin-bottom: 12px; }
.header-section h3 { margin: 0; font-size: 20px; font-weight: 600; }
.header-section p { color: #8c8c8c; font-size: 13px; }

.step-box {
  background: #fbfbfb;
  border: 1px solid #eee;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
  transition: all 0.3s;
}

.danger-box { border-left: 4px solid #ff4d4f; background: #fffcfc; }
.is-locked { opacity: 0.4; pointer-events: none; filter: grayscale(1); }

.step-info { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.step-num { 
  width: 24px; height: 24px; background: #1890ff; color: #fff; 
  border-radius: 50%; display: flex; align-items: center; justify-content: center;
  font-weight: bold; font-size: 12px;
}
.step-info .text .t { font-weight: 600; font-size: 14px; }
.step-info .text .d { font-size: 12px; color: #8c8c8c; }

.step-ctrl { display: flex; flex-direction: column; gap: 10px; }

.form-content { display: flex; flex-direction: column; gap: 12px; }
.f-group { display: flex; gap: 10px; }
.f-item { display: flex; flex-direction: column; gap: 4px; }
.f-item label { font-size: 12px; color: #555; }

.install-btn { margin-top: 20px; border-radius: 8px; font-weight: 600; }
</style>
