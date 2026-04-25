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
  // 1. 如果必填資訊不全，清空列表並退出
  if (!newMc || !newType) {
    loaderVersions.value = [];
    form.loaderVersion = "";
    return;
  }
  
  loadingLoaders.value = true;
  // 這裡不要立刻清空 loaderVersions.value，等數據拿到了再覆蓋，
  // 這樣可以防止 a-select 因為數據瞬間消失而產生的 emitsOptions 報錯
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
        // NeoForge 有時返回對象，有時返回字串，這裡做個兼容處理
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
            tag: v.loader.stable ? "" : "[舊版]" 
          });
        });
      }
    }

    // 最後一次性更新響應式數據
    form.loaderVersion = ""; 
    loaderVersions.value = tempVersions;

    if (tempVersions.length === 0) {
      message.info("該版本下暫無可用加載器");
    }
  } catch (err) {
    console.error("Loader Fetch Error:", err);
    loaderVersions.value = [];
    message.error("獲取版本失敗，請確認網絡或 Worker 狀態");
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
// 修改 ModLoaderInstall.vue 中的 handleInstall
const handleInstall = async () => {
  if (!form.loaderVersion) return message.warning("請先選擇版本");

  confirmLoading.value = true;
  try {
    // 這裡的路徑應該對齊你之前成功的 CurseForge 請求路徑
    // 注意：MCSManager 前端通常會自動處理 token 和基礎 URL
    await axios.post(`/api/protected_instance/asynchronous`, {
      // 注意：這裡的數據結構要對齊後端接收的格式
      instanceUuid: props.instanceId, 
      taskName: "modloader_install",
      parameter: {
        mcVersion: form.mcVersion,
        loaderType: form.loaderType,
        loaderVersion: form.loaderVersion
      }
    }, {
      params: { 
        daemonId: props.daemonId,
        uuid: props.instanceId // 這裡的 uuid 是給 Panel 路由用的，保持不變
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
