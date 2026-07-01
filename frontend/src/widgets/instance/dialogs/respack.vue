<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { t } from "@/lang/i18n";
import { message, Modal } from "ant-design-vue";
import {
  CloudUploadOutlined,
  LoadingOutlined,
  DeleteOutlined,
  ReloadOutlined,
  LinkOutlined
} from "@ant-design/icons-vue";

// 引入 MCSM 的檔案讀取與上傳服務
import { fileContent, uploadAddress } from "@/services/apis/fileManager";
import uploadService from "@/services/uploadService";
import { parseForwardAddress } from "@/tools/protocol";

// --- 設定你的自建後端資訊 ---
const BACKEND_URL = "https://rp.lazycloud.one"; 
const BACKEND_API_KEY = "45fdby784Yts&Oagd2Y79ahY&,SDA"; // 替換為你 docker-compose 裡設定的金鑰

const props = defineProps<{ daemonId: string; instanceId: string }>();

const open = ref(false);
const uploading = ref(false);
const processing = ref(false);
const historyList = ref<any[]>([]);
const uploadProgress = ref(0);

// 獲取 MCSM 檔案內容的 hook
const { execute: fetchFileContent } = fileContent();
// 獲取上傳憑證的 hook
const { execute: getUploadMissionCfg } = uploadAddress();

// 開啟對話框
const openDialog = () => {
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
  if (!file.name.endsWith('.zip')) {
    return message.error(t("請上傳 ZIP 格式的材質包"));
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
      message.success(t("材質包上傳成功！"));
      fetchHistory(); 
    } else {
      message.error(t("上傳失敗: ") + xhr.responseText);
    }
  };

  xhr.onerror = () => {
    uploading.value = false;
    message.error(t("上傳失敗，請檢查網路連線"));
  };

  xhr.send(formData);
};

// 續期
const handleRenew = async (fileId: string) => {
  try {
    const res = await fetch(`${BACKEND_URL}/api/renew/${fileId}`, { method: "PUT" });
    if (res.ok) {
      message.success(t("已成功續期 35 天！"));
      fetchHistory();
    }
  } catch (err) {
    message.error(t("續期失敗"));
  }
};

// 刪除
const handleDelete = async (fileId: string) => {
  Modal.confirm({
    title: t("確認刪除這個材質包？"),
    content: t("刪除後將無法恢復，且已應用此材質包的伺服器將無法下載。"),
    okType: "danger",
    onOk: async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/files/${fileId}`, {
          method: "DELETE",
          headers: { "X-Uploader-Id": props.instanceId }
        });
        if (res.ok) {
          message.success(t("材質包已刪除"));
          fetchHistory();
        }
      } catch (err) {
        message.error(t("刪除失敗"));
      }
    }
  });
};

// 應用到伺服器 (純前端處理 server.properties)
const handleApplyToServer = async (file: any) => {
  processing.value = true;
  const msgKey = "apply_rp_task";
  message.loading({ content: t("正在讀取伺服器設定檔..."), key: msgKey });

  try {
    // 1. 讀取 server.properties
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

    // 2. 解析並替換字串
    message.loading({ content: t("正在寫入材質包設定..."), key: msgKey });
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

    // 3. 將修改後的內容轉為 Blob 並透過 MCSM 上傳 API 覆蓋回去
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

    message.success({ content: t("材質包設定已寫入，請重啟伺服器後才會生效！"), key: msgKey, duration: 5 });

  } catch (err: any) {
    message.error({ content: t("應用失敗: ") + err.message, key: msgKey });
  } finally {
    processing.value = false;
  }
};

defineExpose({ openDialog });
</script>

<template>
  <a-modal v-model:open="open" :title="t('材質包管理')" :footer="null" centered width="600px">
    <div class="p-4">
      <!-- 上傳區域 -->
      <div v-if="!uploading" class="mb-6">
        <a-upload-dragger
          :show-upload-list="false"
          :before-upload="(file: any) => { handleUpload(file); return false; }"
        >
          <p class="ant-upload-drag-icon">
            <CloudUploadOutlined style="color: #1890ff" />
          </p>
          <p class="ant-upload-text">{{ t('點擊或拖拽材質包 ZIP 檔至此') }}</p>
          <p class="ant-upload-hint">{{ t('檔案將保存 35 天，可隨時續期') }}</p>
        </a-upload-dragger>
      </div>

      <!-- 上傳進度 -->
      <div v-else class="py-8 flex flex-col items-center">
        <LoadingOutlined spin class="mb-4" style="font-size: 24px; color: #1890ff;" />
        <a-progress :percent="uploadProgress" status="active" class="w-3/4" />
      </div>

      <!-- 歷史紀錄列表 -->
      <div v-if="historyList.length > 0" class="mt-4">
        <a-divider>{{ t('歷史材質包') }}</a-divider>
        <div class="space-y-3 max-h-[300px] overflow-y-auto">
          <div v-for="file in historyList" :key="file.id" class="border rounded-lg p-3 flex flex-col">
            <div class="flex justify-between items-center mb-2">
              <span class="font-medium text-sm truncate" :title="file.original_filename">{{ file.original_filename }}</span>
              <a-tag :color="getRemainingDays(file.expires_at) > 7 ? 'green' : 'orange'">
                {{ t('剩餘') }} {{ getRemainingDays(file.expires_at) }} {{ t('天') }}
              </a-tag>
            </div>
            
            <div class="text-xs text-gray-500 mb-3">
              <div><strong>SHA-1:</strong> {{ file.sha1.substring(0, 12) }}...</div>
            </div>

            <div class="flex gap-2 justify-end">
              <a-button size="small" @click="handleRenew(file.id)" :loading="processing">
                <template #icon><ReloadOutlined /></template>
                {{ t('續期') }}
              </a-button>
              <a-button size="small" danger @click="handleDelete(file.id)">
                <template #icon><DeleteOutlined /></template>
                {{ t('刪除') }}
              </a-button>
              <a-button size="small" type="primary" @click="handleApplyToServer(file)" :loading="processing">
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
:deep(.ant-progress-outer) {
  padding-right: 0 !important;
  margin-right: 0 !important;
}
</style>
