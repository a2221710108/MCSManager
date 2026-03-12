<script setup lang="ts">
import { ref } from "vue";
import { t } from "@/lang/i18n";
import { message, Modal } from "ant-design-vue";
import { useScreen } from "@/hooks/useScreen";
import { 
  GlobalOutlined, 
  PlusOutlined, 
  DeleteOutlined, 
  ReloadOutlined, 
  ExclamationCircleOutlined,
  InfoCircleOutlined 
} from "@ant-design/icons-vue";
import { createVNode } from "vue";

const props = defineProps<{
  daemonId: string;
  instanceId: string;
}>();

// --- 配置區 ---
const API_ENDPOINT = "https://srv.lazycloud.one/srv"; 
const DOMAIN_SUFFIX = "lazycloud.de";
// 請確保此 Key 與 Cloudflare Worker 中的 AUTH_KEY 一致
const AUTH_KEY = ""; 

const open = ref(false);
const isLoading = ref(false);
const isAdding = ref(false);
const srvRecords = ref<any[]>([]);
const { isPhone } = useScreen();

// 表單數據
const newSubdomain = ref("");
const newPort = ref<number>();

const openDialog = async () => {
  open.value = true;
  await fetchSRVList();
};

// 請求封裝
const apiRequest = async (method: string, body?: any) => {
  const options: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Custom-Auth": AUTH_KEY 
    }
  };
  if (body) options.body = JSON.stringify(body);
  
  const url = `${API_ENDPOINT}?instanceId=${props.instanceId}`;
  const res = await fetch(url, options);
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || "請求失敗");
  }
  return res;
};

// 獲取 SRV 列表
const fetchSRVList = async () => {
  try {
    isLoading.value = true;
    const res = await apiRequest("GET");
    srvRecords.value = await res.json();
  } catch (err: any) {
    message.error(t("獲取列表失敗: ") + err.message);
  } finally {
    isLoading.value = false;
  }
};

// 添加 SRV 記錄
const handleAddSRV = async () => {
  if (!newSubdomain.value || !newPort.value) {
    return message.warning(t("請填寫完整的子域名與端口"));
  }

  if (!/^[a-zA-Z0-9-]+$/.test(newSubdomain.value)) {
    return message.error(t("子域名格式不正確（僅限字母數字）"));
  }

  try {
    isAdding.value = true;
    await apiRequest("POST", {
      subdomain: newSubdomain.value,
      port: newPort.value
    });
    message.success(t("添加成功，通常在 1-5 分鐘內生效"));
    newSubdomain.value = "";
    newPort.value = undefined;
    await fetchSRVList();
  } catch (err: any) {
    message.error(t("添加失敗: ") + err.message);
  } finally {
    isAdding.value = false;
  }
};

// 刪除 SRV 記錄
const handleDelete = (record: any) => {
  Modal.confirm({
    title: t("確認移除此域名？"),
    icon: createVNode(ExclamationCircleOutlined),
    content: `${record.subdomain}.${DOMAIN_SUFFIX} (Port: ${record.port})`,
    okText: t("確認刪除"),
    okType: "danger",
    cancelText: t("取消"),
    onOk: async () => {
      try {
        await apiRequest("DELETE", {
          dnsId: record.id,
          subdomain: record.subdomain
        });
        message.success(t("已成功移除記錄"));
        await fetchSRVList();
      } catch (err: any) {
        message.error(t("刪除失敗: ") + err.message);
      }
    }
  });
};

defineExpose({ openDialog });
</script>

<template>
  <a-modal
    v-model:open="open"
    :title="t('自定義連線域名')"
    centered
    :footer="null"
    :width="isPhone ? '100%' : '650px'"
    class="srv-modal"
  >
    <div class="srv-manager-wrapper">
      <a-typography-paragraph type="secondary" class="desc-text">
        {{ t("您可以自定義一個子域名，讓玩家無需輸入端口即可加入 Minecraft Java 伺服器。請確保您的端口輸入正確。") }}
      </a-typography-paragraph>

      <div class="config-card">
        <div class="section-title">{{ t("新增解析記錄") }}</div>
        <div class="input-row">
          <a-input 
            v-model:value="newSubdomain" 
            :placeholder="t('子域名')" 
            class="input-subdomain"
          >
            <template #addonAfter>.{{ DOMAIN_SUFFIX }}</template>
          </a-input>
          
          <a-input-number 
            v-model:value="newPort" 
            :placeholder="t('端口')" 
            class="input-port"
            :min="1" 
            :max="65535" 
          />
          
          <a-button type="primary" :loading="isAdding" @click="handleAddSRV" class="btn-add">
            <template #icon><PlusOutlined /></template>
            {{ t("綁定") }}
          </a-button>
        </div>
      </div>

      <div class="list-container">
        <div class="list-header">
          <span class="list-title">{{ t("我的綁定列表") }}</span>
          <a-button type="link" size="small" @click="fetchSRVList" :loading="isLoading">
            <template #icon><ReloadOutlined /></template>
          </a-button>
        </div>

        <a-list 
          :loading="isLoading" 
          :data-source="srvRecords" 
          item-layout="horizontal"
          :locale="{ emptyText: t('目前尚未建立任何域名') }"
        >
          <template #renderItem="{ item }">
            <a-list-item class="srv-item">
              <a-list-item-meta>
                <template #avatar>
                  <div class="domain-icon">
                    <GlobalOutlined />
                  </div>
                </template>
                <template #title>
                  <span class="domain-text">{{ item.subdomain }}.{{ DOMAIN_SUFFIX }}</span>
                </template>
                <template #description>
                  <span class="target-text">{{ t('指向端口:') }} {{ item.port }}</span>
                </template>
              </a-list-item-meta>
              <template #actions>
                <a-button type="link" danger @click="handleDelete(item)">
                  <template #icon><DeleteOutlined /></template>
                  {{ t("移除") }}
                </a-button>
              </template>
            </a-list-item>
          </template>
        </a-list>
      </div>
    </div>
  </a-modal>
</template>

<style scoped>
/* 全局間距 */
.srv-manager-wrapper { padding: 4px; color: var(--text-color); }
.mb-4 { margin-bottom: 16px; }

/* 藍色 Alert 深度適配 */
:deep(.custom-alert) {
  border-radius: 8px;
  background-color: rgba(24, 144, 255, 0.1) !important;
  border: 1px solid rgba(24, 144, 255, 0.2) !important;
}
:deep(.custom-alert .ant-alert-message), 
:deep(.custom-alert .ant-alert-description) {
  color: var(--text-color) !important;
  opacity: 0.9;
}

.desc-text {
  margin-bottom: 20px;
  font-size: 14px;
  /* 使用 currentColor 或不指定顏色，僅通過 opacity 實現灰度感 */
  /* 這樣在深色模式下，它會是半透明的白色；淺色下是半透明的黑色 */
  color: inherit !important;
  opacity: 0.65; 
}

/* 輸入區域卡片 */
.config-card {
  background: rgba(128, 128, 128, 0.08);
  padding: 16px;
  border-radius: 12px;
  margin-bottom: 24px;
}
.section-title {
  font-size: 12px;
  font-weight: bold;
  margin-bottom: 12px;
  opacity: 0.6;
}

/* Flex 佈局解決對齊問題 */
.input-row {
  display: flex;
  gap: 8px;
  align-items: stretch;
}
.input-subdomain { flex: 3; }

/* 修正 InputNumber 的文字垂直居中 */
.input-port { 
  flex: 1.5; 
  display: flex;
  align-items: center;
}
:deep(.ant-input-number-input) {
  height: 32px; /* 與普通 input 保持一致 */
}

/* 列表樣式 */
.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.list-title { font-weight: 600; font-size: 14px; }

.srv-item {
  background: rgba(128, 128, 128, 0.05); /* 使用透明度而非純色 */
  margin-bottom: 10px;
  border: 1px solid rgba(128, 128, 128, 0.1);
  border-radius: 10px;
  padding: 12px !important;
  transition: all 0.3s;
}
.srv-item:hover {
  border-color: #1890ff;
  background: rgba(24, 144, 255, 0.05);
}

.domain-icon {
  width: 36px;
  height: 36px;
  background: rgba(24, 144, 255, 0.15);
  color: #1890ff;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
}

.domain-text { font-weight: bold; color: var(--text-color); }
.target-text { font-size: 12px; opacity: 0.6; color: var(--text-color); }

/* 移動端適配 */
@media (max-width: 576px) {
  .input-row { flex-direction: column; }
  .btn-add { width: 100%; }
}
</style>
