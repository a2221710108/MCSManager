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
const API_ENDPOINT = "https://api.lazycloud.de/srv"; 
const DOMAIN_SUFFIX = "lazycloud.de";
// 請確保此 Key 與 Cloudflare Worker 中的 AUTH_KEY 一致
const AUTH_KEY = "Your_Secret_Access_Key"; 

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
    message.success(t("添加成功，DNS 解析通常在 1-5 分鐘內生效"));
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
  >
    <div class="srv-manager-wrapper">
      <a-alert type="success" show-icon class="mb-4">
        <template #icon><InfoCircleOutlined /></template>
        <template #description>
          {{ t("您可以自定義一個子域名，讓玩家無需輸入端口即可加入。系統將自動解析至高速節點。") }}
        </template>
      </a-alert>

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
          <span class="list-title">{{ t("我的域名列表") }}</span>
          <a-button type="text" size="small" @click="fetchSRVList" :loading="isLoading">
            <template #icon><ReloadOutlined /></template>
            {{ t("重新整理") }}
          </a-button>
        </div>

        <a-list 
          :loading="isLoading" 
          :data-source="srvRecords" 
          item-layout="horizontal"
          bordered
          class="srv-list"
          :locale="{ emptyText: t('目前尚未建立任何自定義域名') }"
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
                  <span class="target-text">指向端口: {{ item.port }}</span>
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
.srv-manager-wrapper { padding: 4px; }
.mb-4 { margin-bottom: 16px; }

.config-card {
  background: rgba(128, 128, 128, 0.08);
  padding: 16px;
  border-radius: 12px;
  margin-bottom: 24px;
}

.section-title {
  font-size: 13px;
  font-weight: bold;
  margin-bottom: 12px;
  color: #666;
  text-transform: uppercase;
}

.input-row {
  display: flex;
  gap: 12px;
}

.input-subdomain { flex: 3; }
.input-port { flex: 2; }
.btn-add { flex: 1; }

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding: 0 4px;
}

.list-title {
  font-weight: 600;
  font-size: 15px;
}

.srv-list {
  background: transparent;
  border-radius: 8px;
  overflow: hidden;
}

.srv-item {
  background: var(--card-bg, #fff);
  margin-bottom: 8px;
  border: 1px solid rgba(128, 128, 128, 0.15);
  border-radius: 8px;
  padding: 12px !important;
  transition: all 0.3s;
}

.srv-item:hover {
  border-color: #1890ff;
  background: rgba(24, 144, 255, 0.02);
}

.domain-icon {
  width: 40px;
  height: 40px;
  background: rgba(24, 144, 255, 0.1);
  color: #1890ff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}

.domain-text { font-weight: bold; }
.target-text { font-size: 12px; opacity: 0.7; }

@media (max-width: 576px) {
  .input-row { flex-direction: column; }
  .btn-add { width: 100%; }
}
</style>
