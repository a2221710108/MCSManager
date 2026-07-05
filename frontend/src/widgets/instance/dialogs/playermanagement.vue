<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { t } from "@/lang/i18n";
import type { InstanceDetail } from "@/types";
import { message } from "ant-design-vue";
import type { UseTerminalHook } from "../../../hooks/useTerminal";
import { fileContent } from "@/services/apis/fileManager";
import {
  SmileOutlined,
  ReloadOutlined,
  StopOutlined,
  DisconnectOutlined,
  SolutionOutlined,
  CrownFilled,
  CrownOutlined,
  UndoOutlined,
  DeleteOutlined,
  UserOutlined,
  // 新增的圖標
  FormOutlined,
  PlusOutlined,
  LinkOutlined,
  EditOutlined,
  CloseCircleOutlined,
  FieldTimeOutlined,
  SearchOutlined
} from "@ant-design/icons-vue";

const props = defineProps<{
  instanceInfo?: InstanceDetail;
  instanceId?: string;
  daemonId?: string;
  useTerminalHook: UseTerminalHook;
}>();

const open = ref(false);
const onlinePlayers = ref<any[]>([]);
const isLoading = ref(false);
// 真實 OP 名單（從 ops.json 取得，用於標記線上玩家與 OP 分頁顯示）
const opPlayers = ref<string[]>([]);
// 封禁與白名單資料
const bannedPlayers = ref<any[]>([]);
const whitelistPlayers = ref<any[]>([]);
const isLoadingBanned = ref(false);
const isLoadingWhitelist = ref(false);
// OP 分頁加載狀態
const isLoadingOp = ref(false);
// 輸入框內容
const newBanName = ref("");
const newWhitelistName = ref("");
const newOpName = ref("");
// 分頁切換
const activeTab = ref("online");
const { sendCommand, isConnect, isRunning } = props.useTerminalHook;

// 白名單開關狀態
const whitelistStatus = ref("false");
const isLoadingWhitelistStatus = ref(false);

// ---------- 檔案讀取 ----------
const { execute: fetchFileContent } = fileContent();
const pingConfig = computed(() => ({
  ip: props.instanceInfo?.config?.pingConfig.ip || "",
  port: props.instanceInfo?.config?.pingConfig.port || 25565
}));

// 取得線上玩家
const fetchPlayers = async (retryCount = 0) => {
  if (!pingConfig.value.ip) return;
  isLoading.value = true;
  onlinePlayers.value = []; // 先清空避免顯示舊資料
  
  try {
    const res = await fetch(
      `https://api.mcstatus.io/v2/status/java/${pingConfig.value.ip}:${pingConfig.value.port}?t=${Date.now()}`
    );
    const data = await res.json();
    
    // 🔑 關鍵修正：如果 API 回傳 online=false，可能是 ping 尚未完成，自動重試一次
    if (!data.online && retryCount < 1) {
      setTimeout(() => fetchPlayers(retryCount + 1), 800);
      return;
    }
    
    if (data.online && data.players?.list) {
      onlinePlayers.value = data.players.list;
    } else if (data.online) {
      message.warning(t("伺服器已開啟但未公開玩家名單"));
    }
  } catch (err) {
    console.error("Fetch players error:", err);
    message.error(t("無法獲取玩家名單"));
  } finally {
    isLoading.value = false;
  }
};

// ---------- 通用 JSON 檔案讀取 ----------
const readJsonFile = async (fileName: string): Promise<any[]> => {
  try {
    const res: any = await fetchFileContent({
      params: { daemonId: props.daemonId ?? "", uuid: props.instanceId ?? "" },
      data: { target: fileName }
    });
    let rawText = "";
    if (typeof res === "string") rawText = res;
    else if (res && typeof res === "object") {
      rawText = res._value || res.value || res.data || res.content || "";
    }
    if (!rawText) return [];
    const parsed = JSON.parse(rawText);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error(`Failed to read ${fileName}`, err);
    return [];
  }
};

const fetchBanList = async () => {
  isLoadingBanned.value = true;
  try {
    bannedPlayers.value = await readJsonFile("banned-players.json");
  } finally {
    isLoadingBanned.value = false;
  }
};

const fetchWhitelist = async () => {
  isLoadingWhitelist.value = true;
  try {
    whitelistPlayers.value = await readJsonFile("whitelist.json");
  } finally {
    isLoadingWhitelist.value = false;
  }
  await fetchWhitelistStatus();
};

// 讀取 server.properties 中的 white-list= 狀態
const fetchWhitelistStatus = async () => {
  isLoadingWhitelistStatus.value = true;
  try {
    const res: any = await fetchFileContent({
      params: { daemonId: props.daemonId ?? "", uuid: props.instanceId ?? "" },
      data: { target: "server.properties" }
    });
    let rawText = "";
    if (typeof res === "string") rawText = res;
    else if (res && typeof res === "object") {
      rawText = res._value || res.value || res.data || res.content || "";
    }
    const match = rawText.match(/^white-list=(.*)$/m);
    whitelistStatus.value = (match && match[1]) ? match[1].trim() : "false";
  } catch (err) {
    console.error("Failed to read server.properties:", err);
    whitelistStatus.value = "false";
  } finally {
    isLoadingWhitelistStatus.value = false;
  }
};

// 切換白名單開關
const toggleWhitelistStatus = async () => {
  if (!isConnect.value) return message.error(t("終端連線尚未就緒"));
  if (!checkServerRunning()) return;
  try {
    const cmd = whitelistStatus.value === "true" ? "whitelist off" : "whitelist on";
    await sendCommand(cmd);
    message.success(`${t("指令已發送")}: ${cmd}`);
    setTimeout(fetchWhitelistStatus, 1500);
  } catch (err) {
    message.error(t("發送命令失敗"));
  }
};

const fetchOpList = async () => {
  isLoadingOp.value = true;
  try {
    const data = await readJsonFile("ops.json");
    opPlayers.value = data.map((item: any) => item.name);
  } finally {
    isLoadingOp.value = false;
  }
};

const refreshRestrictionLists = () => {
  fetchBanList();
  fetchWhitelist();
  fetchOpList();
};

// ---------- 伺服器狀態檢查 ----------
const checkServerRunning = (): boolean => {
  if (!isRunning.value) {
    message.error(t("伺服器未在運行中，無法發送指令"));
    return false;
  }
  return true;
};

// ---------- 通用指令發送 ----------
const runCommand = async (cmd: string, playerName: string) => {
  const fullCommand = cmd.replace("{player}", playerName);
  if (!isConnect.value) {
    return message.error(t("終端連線尚未就緒，請稍後"));
  }
  if (!checkServerRunning()) return;
  try {
    await sendCommand(fullCommand);
    message.success(`${t("指令已發送")}: ${fullCommand}`);
    // 影響名單的指令自動刷新
    if (/^(ban|pardon|whitelist|op|deop)\b/.test(fullCommand)) {
      setTimeout(() => refreshRestrictionLists(), 1500);
    }
  } catch (err: any) {
    console.error("Command error:", err);
    const errorMsg = err.message || String(err);
    message.error(`${t("執行失敗")}: ${errorMsg}`);
  }
};

// ---------- 批量操作 ----------
const banByName = async () => {
  const name = newBanName.value.trim();
  if (!name) return message.warning(t("請輸入玩家名稱"));
  if (!isConnect.value) return message.error(t("終端連線尚未就緒"));
  if (!checkServerRunning()) return;
  try {
    await sendCommand(`ban ${name}`);
    message.success(`${t("已封禁")}: ${name}`);
    newBanName.value = "";
    setTimeout(refreshRestrictionLists, 1500);
  } catch (err) {
    message.error(t("發送命令失敗"));
  }
};

const addToWhitelist = async () => {
  const name = newWhitelistName.value.trim();
  if (!name) return message.warning(t("請輸入玩家名稱"));
  if (!isConnect.value) return message.error(t("終端連線尚未就緒"));
  if (!checkServerRunning()) return;
  try {
    await sendCommand(`whitelist add ${name}`);
    message.success(`${t("已加入白名單")}: ${name}`);
    newWhitelistName.value = "";
    setTimeout(refreshRestrictionLists, 1500);
  } catch (err) {
    message.error(t("發送命令失敗"));
  }
};

const unbanPlayer = async (name: string) => {
  if (!isConnect.value) return message.error(t("終端連線尚未就緒"));
  if (!checkServerRunning()) return;
  try {
    await sendCommand(`pardon ${name}`);
    message.success(`${t("已解除封禁")}: ${name}`);
    setTimeout(refreshRestrictionLists, 1500);
  } catch (err) {
    message.error(t("發送命令失敗"));
  }
};

const removeFromWhitelist = async (name: string) => {
  if (!isConnect.value) return message.error(t("終端連線尚未就緒"));
  if (!checkServerRunning()) return;
  try {
    await sendCommand(`whitelist remove ${name}`);
    message.success(`${t("已從白名單移除")}: ${name}`);
    setTimeout(refreshRestrictionLists, 1500);
  } catch (err) {
    message.error(t("發送命令失敗"));
  }
};

// OP 管理
const addOp = async () => {
  const name = newOpName.value.trim();
  if (!name) return message.warning(t("請輸入玩家名稱"));
  if (!isConnect.value) return message.error(t("終端連線尚未就緒"));
  if (!checkServerRunning()) return;
  try {
    await sendCommand(`op ${name}`);
    message.success(`${t("已授予 OP")}: ${name}`);
    newOpName.value = "";
    setTimeout(refreshRestrictionLists, 1500);
  } catch (err) {
    message.error(t("發送命令失敗"));
  }
};

const removeOp = async (name: string) => {
  if (!isConnect.value) return message.error(t("終端連線尚未就緒"));
  if (!checkServerRunning()) return;
  try {
    await sendCommand(`deop ${name}`);
    message.success(`${t("已撤銷 OP")}: ${name}`);
    setTimeout(refreshRestrictionLists, 1500);
  } catch (err) {
    message.error(t("發送命令失敗"));
  }
};
// 人生冇意義 想死
// ---------- 輔助 ----------
const isOp = (name: string) => opPlayers.value.includes(name);
const getAvatar = (name: string) => `https://minotar.net/avatar/${name}/32`;

// ==========================================
// 白名單申請審核系統 (獨立模組)
// ==========================================
const WORKER_URL = "https://join.lazycloud.de"; 

const applyFormData = ref<any>(null);
const applications = ref<any[]>([]);
const isLoadingApps = ref(false);
const formBuilderOpen = ref(false);
const appFilter = ref('pending');
const searchQuery = ref('');

const formConfig = ref<any>({
  server_name: "",
  server_description: "",
  fields: [
    { label: "Discord", type: "input", required: false },
    { label: "你在哪裡看見我們？", type: "radio", required: false, options: ["朋友推薦", "Threads"] }
  ]
});

const filteredApplications = computed(() => {
  if (!searchQuery.value) return applications.value;
  return applications.value.filter(app => 
    app.mc_username.toLowerCase().includes(searchQuery.value.toLowerCase())
  );
});

const loadApplyData = async () => {
  if (!props.instanceId) return;
  try {
    const res = await fetch(`${WORKER_URL}/api/form/${props.instanceId}`);
    const data = await res.json();
    if (data.status === 'active') {
      applyFormData.value = data;
      await loadApplications();
    } else {
      applyFormData.value = null;
      applications.value = [];
    }
  } catch (err) { console.error("Load apply data error:", err); }
};

const loadApplications = async () => {
  if (!props.instanceId) return;
  isLoadingApps.value = true;
  try {
    const res = await fetch(`${WORKER_URL}/api/apps/${props.instanceId}`);
    const data = await res.json();
    applications.value = data.filter((app: any) => app.status === appFilter.value);
  } catch (err) { console.error("Load applications error:", err); } 
  finally { isLoadingApps.value = false; }
};

watch(appFilter, () => { if (applyFormData.value) loadApplications(); });

const openFormBuilder = () => {
  if (applyFormData.value) {
    formConfig.value.server_name = applyFormData.value.server_name || "";
    formConfig.value.server_description = applyFormData.value.server_description || "";
    formConfig.value.fields = JSON.parse(applyFormData.value.form_config).map((f: any) => ({ ...f, required: f.required || false }));
  } else {
    formConfig.value.server_name = (props.instanceInfo as any)?.nickname || "Minecraft Server";
    formConfig.value.server_description = "";
    formConfig.value.fields = [
      { label: "Discord", type: "input", required: false },
      { label: "你在哪裡看見我們？", type: "radio", required: false, options: ["朋友推薦", "Threads"] }
    ];
  }
  formBuilderOpen.value = true;
};

const addCustomField = () => {
  if (formConfig.value.fields.length >= 5) return message.warning(t("最多只能新增 5 個自定義欄位"));
  formConfig.value.fields.push({ label: "新欄位", type: "input", required: false, options: ["選項1"] });
};

const onFieldTypeChange = (field: any, newType: any) => {
  if ((newType === 'radio' || newType === 'checkbox') && !field.options) {
    field.options = ['選項1', '選項2'];
  }
};

const publishForm = async () => {
  try {
    await fetch(`${WORKER_URL}/api/form/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instance_id: props.instanceId,
        server_name: formConfig.value.server_name,
        server_description: formConfig.value.server_description,
        fields: formConfig.value.fields
      })
    });
    message.success(t("表單已發佈！"));
    formBuilderOpen.value = false;
    loadApplyData();
  } catch (err) { message.error(t("發佈失敗")); }
};

const copyApplyUrl = () => {
  if (!applyFormData.value) return;
  navigator.clipboard.writeText(`${WORKER_URL}/${applyFormData.value.short_id}`);
  message.success(t("連結已複製到剪貼簿"));
};

const resetExpiry = async () => {
  await fetch(`${WORKER_URL}/api/form/reset`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ instance_id: props.instanceId })
  });
  message.success(t("有效期已重置為 35 天"));
  loadApplyData();
};

const closeForm = async () => {
  await fetch(`${WORKER_URL}/api/form/close`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ instance_id: props.instanceId })
  });
  message.success(t("已關閉申請頁並清除所有相關資料"));
  applyFormData.value = null;
  applications.value = [];
};

const approveApp = async (item: any) => {
  if (!checkServerRunning()) return;
  if (!isConnect.value) return message.error(t("終端連線尚未就緒"));
  try {
    await sendCommand(`whitelist add ${item.mc_username}`);
    await fetch(`${WORKER_URL}/api/app/update`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, status: "approved" })
    });
    message.success(`${t("已通過並加入白名單")}: ${item.mc_username}`);
    loadApplications();
  } catch (err) { message.error(t("操作失敗")); }
};

const rejectApp = async (item: any) => {
  await fetch(`${WORKER_URL}/api/app/update`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: item.id, status: "rejected" })
  });
  message.success(`${t("已拒絕申請")}: ${item.mc_username}`);
  loadApplications();
};

const parseAppData = (item: any) => {
  try {
    const data = JSON.parse(item.form_data);
    return Object.entries(data).map(([key, val]) => ({
      label: key,
      value: Array.isArray(val) ? val.join(", ") : (val as string)
    }));
  } catch { return []; }
};

const getPreviewFields = (item: any) => parseAppData(item).slice(0, 3);
const getDetailFields = (item: any) => parseAppData(item).slice(3);
const toggleDetail = (item: any) => item.showDetail = !item.showDetail;
const formatTime = (timestamp: number) => new Date(timestamp).toLocaleString();
const formatExpiry = (timestamp: number) => new Date(timestamp).toLocaleDateString();

const openDialog = () => {
  open.value = true;
  activeTab.value = "online";
  fetchPlayers();
  refreshRestrictionLists();
  loadApplyData();
};

watch(activeTab, (tab) => {
  if (tab === "online") fetchPlayers();
  else if (tab === "banned") fetchBanList();
  else if (tab === "whitelist") fetchWhitelist();
  else if (tab === "op") fetchOpList();
  else if (tab === "apply") loadApplyData();
});

defineExpose({ openDialog });
</script>

<template>
  <a-modal
    v-model:open="open"
    :title="t('玩家管理')"
    :footer="null"
    :width="650"
    centered
    destroy-on-close
  >
    <a-tabs v-model:activeKey="activeTab" type="card">
      <!-- 在線管理 -->
      <a-tab-pane key="online" :tab="t('在線管理')">
        <div class="header-actions">
          <a-typography-text type="secondary">
            <SmileOutlined /> {{ t("當前在線") }}: {{ onlinePlayers.length }}
            <a-badge v-if="isConnect" status="processing" color="green" class="ml-12" text="Socket Ready" />
          </a-typography-text>
          <a-tooltip placement="left">
            <template #title>{{ t("數據可能有 1-5 分鐘延遲，取決於 API 緩存時間") }}</template>
            <a-button type="link" size="small" :loading="isLoading" @click="fetchPlayers()">
              <template #icon><ReloadOutlined /></template>
              {{ t("重新整理") }}
            </a-button>
          </a-tooltip>
        </div>
        <a-divider style="margin: 12px 0 16px 0" />
        <div class="scroll-container">
          <a-list :data-source="onlinePlayers" :loading="isLoading" :split="false">
            <template #renderItem="{ item }">
              <a-list-item class="player-list-item">
                <div class="player-card">
                  <div class="player-identity">
                    <a-avatar :src="getAvatar(item.name_raw || item.name)" />
                    <div class="player-name-group">
                      <span :class="{ 'is-op': isOp(item.name_raw || item.name) }">{{ item.name_raw || item.name }}</span>
                      <a-tag v-if="isOp(item.name_raw || item.name)" color="red" size="small">OP</a-tag>
                    </div>
                  </div>
                  <div class="player-ops">
                    <a-button-group :disabled="!isConnect || !isRunning">
                      <a-tooltip :title="t('設為管理員')"><a-button @click="runCommand('op {player}', item.name_raw || item.name)"><template #icon><CrownFilled /></template></a-button></a-tooltip>
                      <a-tooltip :title="t('撤銷管理員')"><a-button @click="runCommand('deop {player}', item.name_raw || item.name)"><template #icon><CrownOutlined /></template></a-button></a-tooltip>
                      <a-tooltip :title="t('生存模式')"><a-button @click="runCommand('gamemode survival {player}', item.name_raw || item.name)">S</a-button></a-tooltip>
                      <a-tooltip :title="t('創造模式')"><a-button @click="runCommand('gamemode creative {player}', item.name_raw || item.name)">C</a-button></a-tooltip>
                      <a-tooltip :title="t('添加白名單')"><a-button @click="runCommand('whitelist add {player}', item.name_raw || item.name)"><template #icon><SolutionOutlined /></template></a-button></a-tooltip>
                      <a-popconfirm :title="t('確定踢出玩家？')" @confirm="runCommand('kick {player}', item.name_raw || item.name)"><a-button danger class="kick-btn"><DisconnectOutlined /></a-button></a-popconfirm>
                      <a-popconfirm :title="t('確定封禁玩家？')" @confirm="runCommand('ban {player}', item.name_raw || item.name)"><a-button danger type="primary"><StopOutlined /></a-button></a-popconfirm>
                    </a-button-group>
                  </div>
                </div>
              </a-list-item>
            </template>
          </a-list>
        </div>
      </a-tab-pane>

      <!-- 封禁管理 -->
      <a-tab-pane key="banned" :tab="t('封禁管理')">
        <div class="header-actions">
          <a-typography-text type="secondary"><StopOutlined /> {{ t("已封禁玩家") }}: {{ bannedPlayers.length }}</a-typography-text>
          <div class="header-right-controls">
            <a-input v-model:value="newBanName" :placeholder="t('輸入玩家名稱')" class="custom-input-top" size="small" />
            <a-button type="primary" danger :disabled="!isConnect || !isRunning" @click="banByName" class="custom-btn-top" size="small">
              <template #icon><StopOutlined /></template> {{ t("封禁") }}
            </a-button>
            <a-divider type="vertical" style="height: 16px; margin: 0 4px;" />
            <a-button type="link" size="small" :loading="isLoadingBanned" @click="fetchBanList"><template #icon><ReloadOutlined /></template> {{ t("重新整理") }}</a-button>
          </div>
        </div>
        <a-divider style="margin: 12px 0 16px 0" />
        <div class="scroll-container">
          <a-list :data-source="bannedPlayers" :loading="isLoadingBanned" :split="false" :locale="{ emptyText: t('暫無被封禁的玩家') }">
            <template #renderItem="{ item }">
              <a-list-item class="player-list-item">
                <div class="player-card">
                  <div class="player-identity">
                    <a-avatar :src="getAvatar(item.name)" />
                    <div class="player-name-group">
                      <span :class="{ 'is-op': isOp(item.name) }">{{ item.name }}</span>
                      <a-tag v-if="item.reason" color="orange" style="margin-top: 2px;">{{ item.reason }}</a-tag>
                    </div>
                  </div>
                  <div class="player-ops">
                    <a-button class="action-btn-danger" type="text" danger :disabled="!isConnect || !isRunning" @click="unbanPlayer(item.name)">
                      <template #icon><UndoOutlined /></template> {{ t("解除封禁") }}
                    </a-button>
                  </div>
                </div>
              </a-list-item>
            </template>
          </a-list>
        </div>
      </a-tab-pane>

      <!-- 白名單管理 -->
      <a-tab-pane key="whitelist" :tab="t('白名單管理')">
        <div class="header-actions">
          <a-typography-text type="secondary">
            <SolutionOutlined /> {{ t("白名單玩家") }}: {{ whitelistPlayers.length }}
            <a-divider type="vertical" style="height: 16px; margin: 0 8px;" />
            <a-tag :color="whitelistStatus === 'true' ? 'green' : 'red'">
              {{ whitelistStatus === 'true' ? t('白名單開啟中') : t('白名單已關閉') }}
            </a-tag>
          </a-typography-text>
          <div class="header-right-controls">
            <a-input v-model:value="newWhitelistName" :placeholder="t('輸入玩家名稱')" class="custom-input-top" size="small" />
            <a-button type="primary" :disabled="!isConnect || !isRunning" @click="addToWhitelist" class="custom-btn-top" size="small">
              <template #icon><SolutionOutlined /></template> {{ t("新增") }}
            </a-button>
            <a-button 
              size="small" 
              :danger="whitelistStatus === 'true'" 
              @click="toggleWhitelistStatus" 
              :loading="isLoadingWhitelistStatus" 
              :disabled="!isConnect || !isRunning"
            >
              {{ whitelistStatus === 'true' ? t('關閉白名單') : t('開啟白名單') }}
            </a-button>
            <a-button type="link" size="small" :loading="isLoadingWhitelist" @click="fetchWhitelist">
              <template #icon><ReloadOutlined /></template> {{ t("重新整理") }}
            </a-button>
          </div>
        </div>
        <a-divider style="margin: 12px 0 16px 0" />
        <div class="scroll-container">
          <a-list :data-source="whitelistPlayers" :loading="isLoadingWhitelist" :split="false" :locale="{ emptyText: t('白名單為空') }">
            <template #renderItem="{ item }">
              <a-list-item class="player-list-item">
                <div class="player-card">
                  <div class="player-identity">
                    <a-avatar :src="getAvatar(item.name)" />
                    <div class="player-name-group"><span :class="{ 'is-op': isOp(item.name) }">{{ item.name }}</span></div>
                  </div>
                  <div class="player-ops">
                    <a-button class="action-btn-danger" type="text" danger :disabled="!isConnect || !isRunning" @click="removeFromWhitelist(item.name)">
                      <template #icon><DeleteOutlined /></template> {{ t("刪除") }}
                    </a-button>
                  </div>
                </div>
              </a-list-item>
            </template>
          </a-list>
        </div>
      </a-tab-pane>

      <!-- OP 管理 -->
      <a-tab-pane key="op" :tab="t('OP 管理')">
        <div class="header-actions">
          <a-typography-text type="secondary"><UserOutlined /> {{ t("管理員名單") }}: {{ opPlayers.length }}</a-typography-text>
          <div class="header-right-controls">
            <a-input v-model:value="newOpName" :placeholder="t('輸入玩家名稱')" class="custom-input-top" size="small" />
            <a-button type="primary" :disabled="!isConnect || !isRunning" @click="addOp" class="custom-btn-top" size="small">
              <template #icon><CrownFilled /></template> {{ t("授予") }}
            </a-button>
            <a-divider type="vertical" style="height: 16px; margin: 0 4px;" />
            <a-button type="link" size="small" :loading="isLoadingOp" @click="fetchOpList"><template #icon><ReloadOutlined /></template> {{ t("重新整理") }}</a-button>
          </div>
        </div>
        <a-divider style="margin: 12px 0 16px 0" />
        <div class="scroll-container">
          <a-list :data-source="opPlayers" :loading="isLoadingOp" :split="false" :locale="{ emptyText: t('尚無管理員') }">
            <template #renderItem="{ item }">
              <a-list-item class="player-list-item">
                <div class="player-card">
                  <div class="player-identity">
                    <a-avatar :src="getAvatar(item)" />
                    <div class="player-name-group"><span class="is-op">{{ item }}</span></div>
                  </div>
                  <div class="player-ops">
                    <a-button class="action-btn-danger" type="text" danger :disabled="!isConnect || !isRunning" @click="removeOp(item)">
                      <template #icon><DeleteOutlined /></template> {{ t("撤銷 OP") }}
                    </a-button>
                  </div>
                </div>
              </a-list-item>
            </template>
          </a-list>
        </div>
      </a-tab-pane>

      <!-- 申請審核系統 -->
      <a-tab-pane key="apply" :tab="t('白名單申請系統')">
        <div class="header-actions">
          <a-typography-text type="secondary">
            <FormOutlined /> {{ t("表單狀態") }}:
            <a-tag v-if="applyFormData" color="green">開啟中</a-tag>
            <a-tag v-else color="red">未建立</a-tag>
            <span v-if="applyFormData" class="ml-12 text-xs"><FieldTimeOutlined /> 到期: {{ formatExpiry(applyFormData.expires_at) }}</span>
          </a-typography-text>
          <div class="header-right-controls">
            <a-button v-if="!applyFormData" type="primary" size="small" @click="openFormBuilder">
              <template #icon><PlusOutlined /></template> {{ t("創建申請表單") }}
            </a-button>
            <a-button-group v-else size="small">
              <a-button @click="copyApplyUrl"><template #icon><LinkOutlined /></template> {{ t("連結") }}</a-button>
              <a-button @click="openFormBuilder"><template #icon><EditOutlined /></template> {{ t("編輯") }}</a-button>
              <a-button @click="resetExpiry">{{ t("重置35天") }}</a-button>
              <a-button danger @click="closeForm"><template #icon><CloseCircleOutlined /></template> {{ t("關閉刪除") }}</a-button>
            </a-button-group>
          </div>
        </div>

        <a-divider style="margin: 12px 0 16px 0" />

        <div v-if="applyFormData">
          <div class="header-actions" style="margin-bottom: 12px;">
            <a-radio-group v-model:value="appFilter" size="small">
              <a-radio-button value="pending">待審核</a-radio-button>
              <a-radio-button value="approved">已通過</a-radio-button>
              <a-radio-button value="rejected">已拒絕</a-radio-button>
            </a-radio-group>
            <a-input-search v-model:value="searchQuery" placeholder="搜尋玩家名稱" size="small" style="width: 150px" allow-clear />
            <a-button type="link" size="small" :loading="isLoadingApps" @click="loadApplications">
              <template #icon><ReloadOutlined /></template> {{ t("重新整理") }}
            </a-button>
          </div>
          
          <div class="scroll-container">
            <a-list :data-source="filteredApplications" :loading="isLoadingApps" :split="false" :locale="{ emptyText: t('暫無申請記錄') }">
              <template #renderItem="{ item }">
                <a-list-item class="player-list-item">
                  <div class="player-card" style="flex-direction: column; align-items: flex-start; gap: 12px; width: 100%;">
                    <div class="player-card" style="width: 100%;">
                      <div class="player-identity">
                        <a-avatar :src="getAvatar(item.mc_username)" />
                        <div class="player-name-group">
                          <span>{{ item.mc_username }}</span>
                          <span class="text-xs text-gray-400">{{ formatTime(item.created_at) }}</span>
                        </div>
                      </div>
                      <div class="player-ops" style="gap: 8px;">
                        <template v-if="item.status === 'pending'">
                          <a-button type="primary" size="small" :disabled="!isConnect || !isRunning" @click="approveApp(item)">
                            {{ t("通過") }}
                          </a-button>
                          <a-button danger size="small" @click="rejectApp(item)">{{ t("拒絕") }}</a-button>
                        </template>
                        <a-tag v-else :color="item.status === 'approved' ? 'green' : 'red'">{{ item.status }}</a-tag>
                        <a-button type="link" size="small" @click="toggleDetail(item)">{{ item.showDetail ? t("收起") : t("詳情") }}</a-button>
                      </div>
                    </div>
                    
                    <div style="background: rgba(128,128,128,0.06); padding: 8px; border-radius: 4px; width: 100%;">
                      <div v-for="(field, index) in getPreviewFields(item)" :key="index" style="margin-bottom: 4px;">
                        <span style="color: rgba(128,128,128,0.8); margin-right: 8px;">{{ field.label }}:</span>
                        <span>{{ field.value }}</span>
                      </div>
                      <div v-if="item.showDetail">
                        <a-divider style="margin: 8px 0" />
                        <div v-for="(field, index) in getDetailFields(item)" :key="index" style="margin-bottom: 4px;">
                          <span style="color: rgba(128,128,128,0.8); margin-right: 8px;">{{ field.label }}:</span>
                          <span>{{ field.value }}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </a-list-item>
              </template>
            </a-list>
          </div>
        </div>
      </a-tab-pane>
    </a-tabs>
  </a-modal>

  <!-- 表單編輯器彈窗 -->
  <a-modal v-model:open="formBuilderOpen" :title="t('配置申請表單')" @ok="publishForm" width="600px" centered>
    <a-form layout="vertical">
      <a-form-item label="伺服器名稱 (標題)">
        <a-input v-model:value="formConfig.server_name" placeholder="My Minecraft Server" />
      </a-form-item>
      <a-form-item label="伺服器簡介 (選填)">
        <a-textarea v-model:value="formConfig.server_description" placeholder="歡迎加入我們的生存伺服器！" :rows="2" />
      </a-form-item>
      
      <a-divider>表單欄位 (上限 6 個，Minecraft 名稱固定為必填)</a-divider>
      
      <!-- 修改為使用透明度顏色，自動適應深淺色模式 -->
      <div style="padding: 8px; background-color: rgba(128, 128, 128, 0.1); border-radius: 4px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
        <a-tag color="blue">必填</a-tag>
        <span>Minecraft 名稱</span>
      </div>

      <!-- 修改為使用透明度顏色，自動適應深淺色模式 -->
      <div v-for="(field, index) in formConfig.fields" :key="index" style="margin-bottom: 12px; border-bottom: 1px dashed rgba(128, 128, 128, 0.3); padding-bottom: 12px;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <a-input v-model:value="field.label" placeholder="欄位名稱" style="width: 40%" />
          <a-select v-model:value="field.type" style="width: 120px" @change="(val) => onFieldTypeChange(field, val)">
            <a-select-option value="input">單行文字</a-select-option>
            <a-select-option value="textarea">多行文字</a-select-option>
            <a-select-option value="radio">單選</a-select-option>
            <a-select-option value="checkbox">多選</a-select-option>
          </a-select>
          <a-checkbox v-model:checked="field.required">必填</a-checkbox>
          <a-button danger size="small" @click="formConfig.fields.splice(index, 1)"><DeleteOutlined /></a-button>
        </div>
        
        <template v-if="field.type === 'radio' || field.type === 'checkbox'">
          <div style="padding-left: 16px; border-left: 2px solid rgba(128, 128, 128, 0.3); margin-top: 8px;">
            <div v-for="(opt, i) in (field.options || ['新選項'])" :key="i" style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
              <a-input v-model:value="field.options[i]" size="small" style="width: 200px" />
              <a-button type="link" danger size="small" @click="field.options.splice(i, 1)"><DeleteOutlined /></a-button>
            </div>
            <a-button type="dashed" size="small" @click="field.options.push('新選項')">+ 新增選項</a-button>
          </div>
        </template>
      </div>

      <a-button type="dashed" block :disabled="formConfig.fields.length >= 5" @click="addCustomField">
        <PlusOutlined /> 新增自定義欄位 (最多 5 個)
      </a-button>
    </a-form>
  </a-modal>
</template>

<style lang="scss" scoped>
.header-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  padding: 0 4px;
  min-height: 24px;
}
.header-right-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  .custom-input-top {
    width: 160px;
    border-radius: 4px !important;
  }
  .custom-btn-top {
    border-radius: 4px !important;
  }
}
.scroll-container {
  max-height: 380px;
  overflow-y: auto;
  padding-right: 4px;
  &::-webkit-scrollbar { width: 6px; }
  &::-webkit-scrollbar-thumb { background-color: rgba(128, 128, 128, 0.25); border-radius: 3px; }
  &::-webkit-scrollbar-track { background-color: transparent; }
}
.player-list-item {
  padding: 8px 12px !important;
  margin-bottom: 8px;
  border: 1px solid rgba(128, 128, 128, 0.15);
  border-radius: 8px;
  background-color: rgba(128, 128, 128, 0.03);
  transition: all 0.2s ease;
  &:hover { background-color: rgba(128, 128, 128, 0.08); border-color: rgba(128, 128, 128, 0.25); }
}
.player-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}
.player-identity {
  display: flex;
  align-items: center;
  gap: 12px;
  .player-name-group {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    .is-op { color: #ff4d4f; font-weight: bold; }
  }
}
.player-ops {
  display: flex;
  align-items: center;
  :deep(.ant-btn-group) {
    & > span:not(:first-child) > .ant-btn-primary,
    & > .ant-btn-primary:not(:first-child) { border-inline-start-color: #ff4d4f !important; }
  }
  .kick-btn {
    &:focus, &:active, &.ant-btn-focused { border-color: #ff4d4f !important; box-shadow: 0 0 0 2px rgba(255, 77, 79, 0.2) !important; z-index: 2; }
  }
  .action-btn-danger {
    border-radius: 4px;
    padding: 4px 12px;
    &:hover:not([disabled]) { background-color: rgba(255, 77, 79, 0.12); }
  }
}
.ml-12 { margin-left: 12px; }
@media (max-width: 768px) {
  .header-actions { flex-direction: column; align-items: flex-start; gap: 10px; }
  .header-right-controls { width: 100%; justify-content: flex-start; .custom-input-top { flex: 1; width: auto; } }
  .player-list-item { padding: 12px !important; }
  .player-card { flex-direction: column; align-items: flex-start; gap: 12px; }
  .player-ops {
    width: 100%;
    justify-content: flex-end;
    .action-btn-danger { width: 100%; text-align: right; }
    :deep(.ant-btn-group) { display: flex; width: 100%; .ant-btn { flex: 1; padding: 4px 8px; } }
  }
}
</style>
