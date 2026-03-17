<script setup lang="ts">
import { ref, computed, onUnmounted } from "vue";
import { t } from "@/lang/i18n";
import { message, Modal } from "ant-design-vue";
import { CloudDownloadOutlined, SettingOutlined, LoadingOutlined, TerminalOutlined } from "@ant-design/icons-vue";
import { getInstanceInfo } from "@/services/apis/instance";
// 假設你有一個封裝好的異步任務啟動 API
// import { startAsyncTask } from "@/services/apis/tasks"; 

const props = defineProps<{ daemonId: string; instanceId: string; }>();
const open = ref(false);
const installing = ref(false);

// 表單數據
const form = ref({
  projectId: "",
  versionId: "latest",
  apiKey: localStorage.getItem("cf_api_key") || "" // 自動記憶 API Key 方便下次使用
});

const logs = ref<string[]>([]);
const { execute: fetchInstanceInfo } = getInstanceInfo();

const openDialog = () => {
  open.value = true;
};

/**
 * 模擬日誌獲取 (實際應透過 WebSocket 監聽實例輸出)
 * 在這裡你可以掛載一個監聽器，監控該實例的日誌
 */
const appendLog = (msg: string) => {
  logs.value.push(msg);
  if (logs.value.length > 50) logs.value.shift();
};

/**
 * 啟動安裝任務
 */
const handleStartInstall = async () => {
  if (!form.value.projectId || !form.value.apiKey) {
    return message.error(t("請填寫 Project ID 與 API Key"));
  }

  // 儲存 API Key 方便下次使用
  localStorage.setItem("cf_api_key", form.value.apiKey);

  const info = await fetchInstanceInfo({ params: { daemonId: props.daemonId, uuid: props.instanceId } });
  if (info.value?.status !== 0) {
    return Modal.warning({ title: t("伺服器運行中"), content: t("請先關閉伺服器再進行安裝。") });
  }

  Modal.confirm({
    title: t("確認開始安裝整合包？"),
    content: t("這將會下載並覆蓋現有檔案，建議先進行備份。"),
    onOk: async () => {
      try {
        installing.value = true;
        logs.value = [t("正在發送安裝請求...")];
        
        // 調用後端新增的 CurseForgeInstallTask
        // 這裡的具體 API 路徑需根據你的後端路由配置
        /* await startAsyncTask({
          action: "CurseForgeInstallTask",
          params: {
            instanceUuid: props.instanceId,
            daemonId: props.daemonId,
            options: { ...form.value }
          }
        });
        */
        
        message.success(t("安裝任務已啟動"));
      } catch (err: any) {
        message.error(t("啟動失敗: ") + err.message);
        installing.value = false;
      }
    }
  });
};

const handleCancel = () => {
  if (installing.value) {
    Modal.confirm({
      title: t("取消安裝？"),
      content: t("取消後可能會留下殘餘檔案，確定停止嗎？"),
      onOk: () => {
        installing.value = false;
        // 調用後端 StopTask API
      }
    });
  } else {
    open.value = false;
  }
};

defineExpose({ openDialog });
</script>

<template>
  <a-modal v-model:open="open" :title="t('CurseForge 整合包自動安裝')" :footer="null" centered :mask-closable="false" width="560px">
    <div class="p-4">
      <div v-if="!installing">
        <div class="mb-6 flex items-center gap-2 text-blue-600">
          <CloudDownloadOutlined />
          <span class="text-sm font-medium">{{ t('從 CurseForge 獲取自動化存檔與 Mod') }}</span>
        </div>

        <a-form layout="vertical">
          <a-form-item :label="t('CurseForge API Key')">
            <a-input-password v-model:value="form.apiKey" placeholder="在此輸入你的 CF API Key">
              <template #prefix><SettingOutlined /></template>
            </a-input-password>
            <p class="text-xs text-gray-400 mt-1">需在 CurseForge Console 申請，用於獲取下載權限。</p>
          </a-form-item>

          <div class="flex gap-4">
            <a-form-item :label="t('Project ID')" class="flex-1">
              <a-input v-model:value="form.projectId" placeholder="例如: 285682" />
            </a-form-item>
            <a-form-item :label="t('File ID (選填)')" class="flex-1">
              <a-input v-model:value="form.versionId" placeholder="latest" />
            </a-form-item>
          </div>
        </a-form>

        <div class="mt-4 p-3 bg-blue-50 rounded border border-blue-100 mb-6">
          <p class="text-xs text-blue-700 m-0">
            {{ t('提示：安裝程序會自動解析 manifest.json，下載所有依賴 Mod 並處理 overrides 覆蓋檔案。') }}
          </p>
        </div>

        <div class="flex justify-end gap-2">
          <a-button @click="open = false">{{ t('取消') }}</a-button>
          <a-button type="primary" :disabled="!form.apiKey || !form.projectId" @click="handleStartInstall">
            {{ t('開始自動安裝') }}
          </a-button>
        </div>
      </div>

      <div v-else class="py-2">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-3">
            <LoadingOutlined spin style="font-size: 20px; color: #1890ff" />
            <span class="text-base font-medium">{{ t('正在安裝整合包...') }}</span>
          </div>
          <a-button size="small" danger ghost @click="handleCancel">{{ t('停止任務') }}</a-button>
        </div>

        <div class="bg-gray-900 rounded-lg p-3 h-64 overflow-y-auto font-mono text-xs text-green-400">
          <div v-for="(log, index) in logs" :key="index" class="mb-1">
            <span class="text-gray-500 mr-2">[{{ new Date().toLocaleTimeString() }}]</span>
            <span>{{ log }}</span>
          </div>
          <div v-if="installing" class="animate-pulse inline-block w-2 h-4 bg-green-400 align-middle"></div>
        </div>
        
        <p class="mt-4 text-xs text-gray-400 text-center">
          {{ t('請勿關閉此窗口，系統正在處理大量檔案下載。') }}
        </p>
      </div>
    </div>
  </a-modal>
</template>

<style scoped>
.font-mono {
  font-family: 'Courier New', Courier, monospace;
}
/* 滾動條樣式 */
.overflow-y-auto::-webkit-scrollbar {
  width: 6px;
}
.overflow-y-auto::-webkit-scrollbar-thumb {
  background-color: #4b5563;
  border-radius: 3px;
}
</style>
