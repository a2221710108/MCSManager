<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { t } from "@/lang/i18n";
import { message, Modal } from "ant-design-vue";
import {
  CloudUploadOutlined,
  LoadingOutlined,
  DeleteOutlined,
  ReloadOutlined,
  LinkOutlined,
  CloseCircleOutlined
} from "@ant-design/icons-vue";

// 引入 MCSM 的檔案讀取與上傳服務
import { fileContent, uploadAddress } from "@/services/apis/fileManager";
import uploadService from "@/services/uploadService";
import { parseForwardAddress } from "@/tools/protocol";

// --- 設定你的自建後端資訊 ---
const BACKEND_URL = "https://rp.lazycloud.de"; 
const BACKEND_API_KEY = "45fdby784Yts&Oagd2Y79ahY&,SDA"; // 替換為你 docker-compose 裡設定的金鑰
const MAX_PACKS = 2; // 資源包歷史紀錄上限
const MIN_MEMORY = 8192; // 最低記憶體限制 (8GB = 8192MB)

const props = defineProps<{ daemonId: string; instanceId: string; instanceInfo?: any }>();

const open = ref(false);
const uploading = ref(false);
const processing = ref(false);
const historyList = ref<any[]>([]);
const uploadProgress = ref(0);

// 獲取 MCSM 檔案內容的 hook
const { execute: fetchFileContent } = fileContent();
// 獲取上傳憑證的 hook
const { execute: getUploadMissionCfg } = uploadAddress();

// 檢查內存大小是否達標
const checkMemory = (): boolean => {
  // 從 JSON 結構中可以看見，Docker 實例的記憶體放在 config.docker.memory (單位為 MB)
  const memory = props.instanceInfo?.config?.docker?.memory ?? 0;
  return memory >= MIN_MEMORY;
};

// 開啟對話框
const openDialog = () => {
  if (!checkMemory()) {
    message.error(t("請至少升級至 鐵礦 或 效率II 套餐"));
    return;
  }
  open.value = true;
  fetchHistory();
};

// 獲取當前實例的歷史上傳紀錄
const fetchHistory = async () => {
  try {
    const res = await fetch(`${BACKEND_URL}/api/files?uploaderId=${props.instanceId}`, {
      method: "GET",
      headers: {
        "X-Api-Key": BACKEND_API_KEY
      }
    });
    if (res.ok) {
      historyList.value = await res.json();
    }
  } catch (err) {
    console.error("Fetch history failed", err);
  }
};

// 計算剩餘天數
const getRemainingDays = (expireAt: string) => {
  const diff = new Date(expireAt).getTime() - new Date().getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
};

// 處理檔案上傳至自建後端
const handleUpload = async (file: File) => {
  // 檢查歷史紀錄上限
  if (historyList.value.length >= MAX_PACKS) {
    return message.error(t(`最多只能保存 ${MAX_PACKS} 個資源包，請先刪除舊的資源包`));
  }

  if (!file.name.endsWith('.zip')) {
    return message.error(t("請上傳 ZIP 格式的資源包"));
  }

  uploading.value = true;
  uploadProgress.value = 0;

  const formData = new FormData();
  formData.append("file", file);

  const xhr = new XMLHttpRequest();
  xhr.open("POST", `${BACKEND_URL}/api/upload`);
  xhr.setRequestHeader("X-Api-Key", BACKEND_API_KEY);
  xhr.setRequestHeader("X-Uploader-Id", props.instanceId);

  xhr.upload.onprogress = (event) => {
    if (event.lengthComputable) {
      uploadProgress.value = Math.floor((event.loaded * 100) / event.total);
    }
  };

  xhr.onload = () => {
    uploading.value = false;
    if (xhr.status === 200) {
      message.success(t("資源包上載成功！"));
      fetchHistory(); 
    } else {
      message.error(t("上載失敗: ") + xhr.responseText);
    }
  };

  xhr.onerror = () => {
    uploading.value = false;
    message.error(t("上載失敗，請檢查網路連線"));
  };

  xhr.send(formData);
};

// 續期
const handleRenew = async (fileId: string) => {
  try {
    const res = await fetch(`${BACKEND_URL}/api/renew/${fileId}`, { method: "PUT" });
    if (res.ok) {
      message.success(t("已成功重置有效期！"));
      fetchHistory();
    }
  } catch (err) {
    message.error(t("續期失敗"));
  }
};

// 刪除
const handleDelete = async (fileId: string) => {
  Modal.confirm({
    title: t("確認刪除這個資源包？"),
    content: t("刪除後將無法恢復，且已應用此資源包的伺服器將無法下載。"),
    okType: "danger",
    onOk: async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/files/${fileId}`, {
          method: "DELETE",
          headers: { "X-Uploader-Id": props.instanceId }
        });
        if (res.ok) {
          message.success(t("資源包已刪除"));
          fetchHistory();
        }
      } catch (err) {
        message.error(t("刪除失敗"));
      }
    }
  });
};

// 核心公用：覆蓋寫回 server.properties
const saveServerProperties = async (newContent: string, msgKey: string, successMsg: string) => {
  const blob = new Blob([newContent], { type: 'text/plain' });
  const uploadFile = new File([blob], "server.properties", { type: 'text/plain' });

  const mission = await getUploadMissionCfg({ 
    params: { 
      upload_dir: "/", 
      daemonId: props.daemonId, 
      uuid: props.instanceId, 
      file_name: "server.properties" 
    }
  });
  
  const config = mission.value;
  if (!config?.addr) throw new Error("取得上傳憑證失敗");

  await new Promise<void>((resolve, reject) => {
    uploadService.append(uploadFile, parseForwardAddress(config.addr, "http"), config.password, { overwrite: true }, (task) => {
      task.instanceInfo = { instanceId: props.instanceId, daemonId: props.daemonId };
    });
    
    const unwatch = watch(() => uploadService.uiData.value.current, (curr: any) => {
      if (!curr) { 
        unwatch(); 
        resolve(); 
      }
    });
  });

  message.success({ content: t(successMsg), key: msgKey, duration: 5 });
};

// 應用到伺服器 (純前端處理 server.properties)
const handleApplyToServer = async (file: any) => {
  processing.value = true;
  const msgKey = "apply_rp_task";
  message.loading({ content: t("正在讀取伺服器設定檔..."), key: msgKey });

  try {
    const res: any = await fetchFileContent({
      params: { daemonId: props.daemonId, uuid: props.instanceId },
      data: { target: "server.properties" }
    });

    let rawText = "";
    if (typeof res === "string") rawText = res;
    else if (res && typeof res === "object") {
      rawText = res._value || res.value || res.data || res.content || "";
    }

    if (!rawText) throw new Error("無法讀取 server.properties 內容");

    message.loading({ content: t("正在寫入資源包設定..."), key: msgKey });
    const downloadUrl = `${BACKEND_URL}/files/${file.id}`;
    const sha1 = file.sha1;
    
    let lines = rawText.split('\n');
    let rpFound = false, shaFound = false;
    
    lines = lines.map(line => {
      if (line.trim().startsWith('resource-pack=')) {
        rpFound = true;
        return `resource-pack=${downloadUrl}`;
      }
      if (line.trim().startsWith('resource-pack-sha1=')) {
        shaFound = true;
        return `resource-pack-sha1=${sha1}`;
      }
      return line;
    });

    if (!rpFound) lines.push(`resource-pack=${downloadUrl}`);
    if (!shaFound) lines.push(`resource-pack-sha1=${sha1}`);
    
    const newContent = lines.join('\n');
    await saveServerProperties(newContent, msgKey, "資源包設定已寫入，請重啟伺服器後才會生效！");

  } catch (err: any) {
    message.error({ content: t("應用失敗: ") + err.message, key: msgKey });
  } finally {
    processing.value = false;
  }
};

// 移除伺服器的資源包設定
const handleRemoveFromServer = async () => {
  Modal.confirm({
    title: t("確認移除資源包設定？"),
    content: t("這將清除伺服器 server.properties 中的資源包連結與 SHA-1，玩家進服將不再下載資源包。"),
    okType: "danger",
    onOk: async () => {
      processing.value = true;
      const msgKey = "remove_rp_task";
      message.loading({ content: t("正在讀取伺服器設定檔..."), key: msgKey });

      try {
        const res: any = await fetchFileContent({
          params: { daemonId: props.daemonId, uuid: props.instanceId },
          data: { target: "server.properties" }
        });

        let rawText = "";
        if (typeof res === "string") rawText = res;
        else if (res && typeof res === "object") {
          rawText = res._value || res.value || res.data || res.content || "";
        }

        if (!rawText) throw new Error("無法讀取 server.properties 內容");

        message.loading({ content: t("正在清除資源包設定..."), key: msgKey });
        
        // 過濾掉資源包相關的行
        let lines = rawText.split('\n');
        lines = lines.filter(line => {
          const trimmed = line.trim();
          return !trimmed.startsWith('resource-pack=') && !trimmed.startsWith('resource-pack-sha1=');
        });
        
        const newContent = lines.join('\n');
        await saveServerProperties(newContent, msgKey, "資源包設定已移除，請重啟伺服器後才會生效！");

      } catch (err: any) {
        message.error({ content: t("移除失敗: ") + err.message, key: msgKey });
      } finally {
        processing.value = false;
      }
    }
  });
};

defineExpose({ openDialog });
</script>

<template>
  <a-modal v-model:open="open" :title="t('資源包管理')" :footer="null" centered width="600px" destroy-on-close>
    <div class="modal-content-wrapper">
      <div v-if="!uploading" class="upload-zone">
        <a-upload-dragger
          :show-upload-list="false"
          :before-upload="(file: any) => { handleUpload(file); return false; }"
          :disabled="historyList.length >= MAX_PACKS"
          class="custom-dragger"
        >
          <p class="ant-upload-drag-icon">
            <CloudUploadOutlined :style="{ color: historyList.length >= MAX_PACKS ? 'rgba(128, 128, 128, 0.4)' : '#1890ff' }" />
          </p>
          <p class="ant-upload-text">
            {{ historyList.length >= MAX_PACKS ? t('已達資源包上限') : t('點擊或拖拽資源包 ZIP 檔至此') }}
          </p>
          <p class="ant-upload-hint">
            {{ t('檔案將保存 35 天，可隨時續期 (上限 ' + MAX_PACKS + ' 個, 最大 500MB)') }}
          </p>
        </a-upload-dragger>
        
        <a-button class="remove-config-btn" danger @click="handleRemoveFromServer" :loading="processing">
          <template #icon><CloseCircleOutlined /></template>
          <span>{{ t('移除伺服器資源包設定') }}</span>
        </a-button>
      </div>

      <div v-else class="progress-zone">
        <LoadingOutlined spin class="progress-spinner" />
        <a-progress :percent="uploadProgress" status="active" class="progress-bar" />
      </div>

      <div v-if="historyList.length > 0" class="history-zone">
        <a-divider style="margin: 16px 0 12px 0;">
          <span class="divider-title">{{ t('歷史資源包') }} ({{ historyList.length }} / {{ MAX_PACKS }})</span>
        </a-divider>
        
        <div class="scroll-container">
          <div v-for="file in historyList" :key="file.id" class="pack-card">
            <div class="pack-header">
              <span class="pack-title" :title="file.original_filename">{{ file.original_filename }}</span>
              <a-tag :color="getRemainingDays(file.expires_at) > 7 ? 'green' : 'orange'" class="pack-tag">
                {{ t('剩餘') }} {{ getRemainingDays(file.expires_at) }} {{ t('天') }}
              </a-tag>
            </div>
            
            <div class="pack-meta">
              <a-typography-text type="secondary" code>
                SHA-1: {{ file.sha1.substring(0, 12) }}...
              </a-typography-text>
            </div>

            <div class="pack-actions">
              <a-button size="small" class="action-btn" @click="handleRenew(file.id)" :loading="processing">
                <template #icon><ReloadOutlined /></template>
                {{ t('續期') }}
              </a-button>
              <a-button size="small" danger class="action-btn" @click="handleDelete(file.id)">
                <template #icon><DeleteOutlined /></template>
                {{ t('刪除') }}
              </a-button>
              <a-button size="small" type="primary" class="action-btn action-btn-main" @click="handleApplyToServer(file)" :loading="processing">
                <template #icon><LinkOutlined /></template>
                {{ t('應用至伺服器') }}
              </a-button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </a-modal>
</template>

<style scoped>
.modal-content-wrapper {
  padding: 12px 4px 4px 4px;
}

.upload-zone {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.custom-dragger {
  background: rgba(128, 128, 128, 0.02) !important;
  border-radius: 8px !important;
  transition: all 0.3s ease;
  
  &:hover:not(.ant-upload-disabled) {
    background: rgba(24, 144, 255, 0.02) !important;
  }
}

.remove-config-btn {
  width: 100%;
  border-radius: 6px !important;
  height: 36px;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  line-height: 1 !important;
  
  /* 確保按鈕內的圖標和文字完美水平、垂直置中 */
  :deep(.anticon) {
    display: inline-flex;
    align-items: center;
    vertical-align: middle;
    margin-top: 0 !important;
  }
  
  span {
    display: inline-block;
    line-height: 1;
  }
}

.progress-zone {
  padding: 40px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
}

.progress-spinner {
  font-size: 28px;
  color: #1890ff;
}

.progress-bar {
  width: 80%;
}

.history-zone {
  margin-top: 8px;
}

.divider-title {
  font-size: 13px;
  opacity: 0.85;
  font-weight: 500;
}

.scroll-container {
  max-height: 290px;
  overflow-y: auto;
  padding-right: 4px;
  display: flex;
  flex-direction: column;
  gap: 10px;

  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-thumb {
    background-color: rgba(128, 128, 128, 0.25);
    border-radius: 3px;
  }
  &::-webkit-scrollbar-track {
    background-color: transparent;
  }
}

.pack-card {
  border: 1px solid rgba(128, 128, 128, 0.15);
  border-radius: 8px;
  padding: 12px;
  background-color: rgba(128, 128, 128, 0.02);
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: all 0.2s ease;

  &:hover {
    background-color: rgba(128, 128, 128, 0.06);
    border-color: rgba(128, 128, 128, 0.25);
  }
}

.pack-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.pack-title {
  font-weight: 500;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.pack-tag {
  flex-shrink: 0;
  margin-right: 0 !important;
  border-radius: 4px;
}

.pack-meta {
  display: flex;
  align-items: center;
  
  :deep(.ant-typography) {
    font-size: 11px;
    padding: 1px 6px;
    background: rgba(128, 128, 128, 0.1);
    border: none;
  }
}

.pack-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  
  .action-btn {
    border-radius: 4px !important;
    font-size: 12px;
    
    &.action-btn-main {
      font-weight: 500;
    }
  }
}

:deep(.ant-progress-outer) {
  padding-right: 0 !important;
  margin-right: 0 !important;
}

@media (max-width: 576px) {
  .pack-card {
    padding: 12px;
  }
  
  .pack-actions {
    width: 100%;
    
    .action-btn {
      flex: 1;
      justify-content: center;
    }
  }
}
</style>
