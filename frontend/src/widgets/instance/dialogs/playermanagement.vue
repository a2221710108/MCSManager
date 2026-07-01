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
  UserOutlined
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

// ---------- 檔案讀取 ----------
const { execute: fetchFileContent } = fileContent();

const pingConfig = computed(() => ({
  ip: props.instanceInfo?.config?.pingConfig.ip || "",
  port: props.instanceInfo?.config?.pingConfig.port || 25565
}));

// 取得線上玩家
const fetchPlayers = async () => {
  if (!pingConfig.value.ip) return;
  isLoading.value = true;
  try {
    const res = await fetch(
      `https://api.mcstatus.io/v2/status/java/${pingConfig.value.ip}:${pingConfig.value.port}?t=${Date.now()}`
    );
    const data = await res.json();
    onlinePlayers.value = [];
    if (data.online && data.players && data.players.list) {
      onlinePlayers.value = data.players.list;
    } else {
      if (data.online) message.warn(t("伺服器已開啟但未公開玩家名單"));
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

// ---------- 輔助 ----------
const isOp = (name: string) => opPlayers.value.includes(name);
const getAvatar = (name: string) => `https://minotar.net/avatar/${name}/32`;

const openDialog = () => {
  open.value = true;
  activeTab.value = "online";
  fetchPlayers();
  refreshRestrictionLists();
};

// 監聽分頁切換以刷新對應數據
watch(activeTab, (tab) => {
  if (tab === "online") fetchPlayers();
  else if (tab === "banned") fetchBanList();
  else if (tab === "whitelist") fetchWhitelist();
  else if (tab === "op") fetchOpList();
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
            <a-button type="link" size="small" :loading="isLoading" @click="fetchPlayers">
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
                      <span :class="{ 'is-op': isOp(item.name_raw || item.name) }">
                        {{ item.name_raw || item.name }}
                      </span>
                      <a-tag v-if="isOp(item.name_raw || item.name)" color="red" size="small">OP</a-tag>
                    </div>
                  </div>
                  <div class="player-ops">
                    <a-button-group :disabled="!isConnect || !isRunning">
                      <a-tooltip :title="t('設為管理員')">
                        <a-button @click="runCommand('op {player}', item.name_raw || item.name)">
                          <template #icon><CrownFilled /></template>
                        </a-button>
                      </a-tooltip>
                      <a-tooltip :title="t('撤銷管理員')">
                        <a-button @click="runCommand('deop {player}', item.name_raw || item.name)">
                          <template #icon><CrownOutlined /></template>
                        </a-button>
                      </a-tooltip>
                      <a-tooltip :title="t('生存模式')">
                        <a-button @click="runCommand('gamemode survival {player}', item.name_raw || item.name)">S</a-button>
                      </a-tooltip>
                      <a-tooltip :title="t('創造模式')">
                        <a-button @click="runCommand('gamemode creative {player}', item.name_raw || item.name)">C</a-button>
                      </a-tooltip>
                      <a-tooltip :title="t('添加白名單')">
                        <a-button @click="runCommand('whitelist add {player}', item.name_raw || item.name)">
                          <template #icon><SolutionOutlined /></template>
                        </a-button>
                      </a-tooltip>
                      <a-popconfirm :title="t('確定踢出玩家？')" @confirm="runCommand('kick {player}', item.name_raw || item.name)">
                        <a-button danger class="kick-btn"><DisconnectOutlined /></a-button>
                      </a-popconfirm>
                      <a-popconfirm :title="t('確定封禁玩家？')" @confirm="runCommand('ban {player}', item.name_raw || item.name)">
                        <a-button danger type="primary"><StopOutlined /></a-button>
                      </a-popconfirm>
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
          <a-typography-text type="secondary">
            <StopOutlined /> {{ t("已封禁玩家") }}: {{ bannedPlayers.length }}
          </a-typography-text>
          <div class="header-right-controls">
            <a-input v-model:value="newBanName" :placeholder="t('輸入玩家名稱')" class="custom-input-top" size="small" />
            <a-button type="primary" danger :disabled="!isConnect || !isRunning" @click="banByName" class="custom-btn-top" size="small">
              <template #icon><StopOutlined /></template>
              {{ t("封禁") }}
            </a-button>
            <a-divider type="vertical" style="height: 16px; margin: 0 4px;" />
            <a-button type="link" size="small" :loading="isLoadingBanned" @click="fetchBanList">
              <template #icon><ReloadOutlined /></template>
              {{ t("重新整理") }}
            </a-button>
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
                      <span :class="{ 'is-op': isOp(item.name) }">
                        {{ item.name }}
                      </span>
                      <a-tag v-if="item.reason" color="orange" style="margin-top: 2px;">{{ item.reason }}</a-tag>
                    </div>
                  </div>
                  <div class="player-ops">
                    <a-button class="action-btn-danger" type="text" danger :disabled="!isConnect || !isRunning" @click="unbanPlayer(item.name)">
                      <template #icon><UndoOutlined /></template>
                      {{ t("解除封禁") }}
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
          </a-typography-text>
          <div class="header-right-controls">
            <a-input v-model:value="newWhitelistName" :placeholder="t('輸入玩家名稱')" class="custom-input-top" size="small" />
            <a-button type="primary" :disabled="!isConnect || !isRunning" @click="addToWhitelist" class="custom-btn-top" size="small">
              <template #icon><SolutionOutlined /></template>
              {{ t("新增") }}
            </a-button>
            <a-divider type="vertical" style="height: 16px; margin: 0 4px;" />
            <a-button type="link" size="small" :loading="isLoadingWhitelist" @click="fetchWhitelist">
              <template #icon><ReloadOutlined /></template>
              {{ t("重新整理") }}
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
                    <div class="player-name-group">
                      <span :class="{ 'is-op': isOp(item.name) }">
                        {{ item.name }}
                      </span>
                    </div>
                  </div>
                  <div class="player-ops">
                    <a-button class="action-btn-danger" type="text" danger :disabled="!isConnect || !isRunning" @click="removeFromWhitelist(item.name)">
                      <template #icon><DeleteOutlined /></template>
                      {{ t("刪除") }}
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
          <a-typography-text type="secondary">
            <UserOutlined /> {{ t("管理員名單") }}: {{ opPlayers.length }}
          </a-typography-text>
          <div class="header-right-controls">
            <a-input v-model:value="newOpName" :placeholder="t('輸入玩家名稱')" class="custom-input-top" size="small" />
            <a-button type="primary" :disabled="!isConnect || !isRunning" @click="addOp" class="custom-btn-top" size="small">
              <template #icon><CrownFilled /></template>
              {{ t("授予") }}
            </a-button>
            <a-divider type="vertical" style="height: 16px; margin: 0 4px;" />
            <a-button type="link" size="small" :loading="isLoadingOp" @click="fetchOpList">
              <template #icon><ReloadOutlined /></template>
              {{ t("重新整理") }}
            </a-button>
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
                    <div class="player-name-group">
                      <span class="is-op">
                        {{ item }}
                      </span>
                    </div>
                  </div>
                  <div class="player-ops">
                    <a-button class="action-btn-danger" type="text" danger :disabled="!isConnect || !isRunning" @click="removeOp(item)">
                      <template #icon><DeleteOutlined /></template>
                      {{ t("撤銷 OP") }}
                    </a-button>
                  </div>
                </div>
              </a-list-item>
            </template>
          </a-list>
        </div>
      </a-tab-pane>
    </a-tabs>
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
  gap: 8px; /* 元素之間保持乾淨且協調的精緻間距 */

  .custom-input-top {
    width: 160px; /* 縮短輸入框寬度以完美適配頂部欄 */
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

.player-list-item {
  padding: 8px 12px !important;
  margin-bottom: 8px;
  border: 1px solid rgba(128, 128, 128, 0.15);
  border-radius: 8px;
  background-color: rgba(128, 128, 128, 0.03);
  transition: all 0.2s ease;

  &:hover {
    background-color: rgba(128, 128, 128, 0.08);
    border-color: rgba(128, 128, 128, 0.25);
  }
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
    
    .is-op { 
      color: #ff4d4f; 
      font-weight: bold; 
    }
  }
}

.player-ops {
  display: flex;
  align-items: center;

  :deep(.ant-btn-group) {
    & > span:not(:first-child) > .ant-btn-primary,
    & > .ant-btn-primary:not(:first-child) {
      border-inline-start-color: #ff4d4f !important;
    }
  }

  .kick-btn {
    &:focus, &:active, &.ant-btn-focused {
      border-color: #ff4d4f !important;
      box-shadow: 0 0 0 2px rgba(255, 77, 79, 0.2) !important;
      z-index: 2;
    }
  }

  .action-btn-danger {
    border-radius: 4px;
    padding: 4px 12px;
    
    &:hover:not([disabled]) {
      background-color: rgba(255, 77, 79, 0.12);
    }
  }
}

.ml-12 { margin-left: 12px; }

@media (max-width: 768px) {
  .header-actions {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }

  .header-right-controls {
    width: 100%;
    justify-content: flex-start;
    
    .custom-input-top {
      flex: 1;
      width: auto;
    }
  }

  .player-list-item {
    padding: 12px !important;
  }
  .player-card {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
  .player-ops {
    width: 100%;
    justify-content: flex-end;
    
    .action-btn-danger {
      width: 100%;
      text-align: right;
    }
    
    :deep(.ant-btn-group) {
      display: flex;
      width: 100%;
      .ant-btn {
        flex: 1;
        padding: 4px 8px;
      }
    }
  }
}
</style>
