<script setup lang="ts">
import { ref, computed } from "vue";
import { t } from "@/lang/i18n";
import type { InstanceDetail } from "@/types";
import { message } from "ant-design-vue";
import type { UseTerminalHook } from "../../../hooks/useTerminal";
import {
  UserOutlined,
  CrownOutlined,
  StopOutlined,
  LogoutOutlined,
  ReloadOutlined,
  SmileOutlined,
  DisconnectOutlined,
  SolutionOutlined,
  CrownFilled,
  UndoOutlined,
  DeleteOutlined,
  PlusSquareOutlined,
  MinusSquareOutlined
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
const opPlayers = ref<string[]>([]);

// 封禁與白名單資料
const bannedPlayers = ref<any[]>([]);
const whitelistPlayers = ref<any[]>([]);
const isLoadingBanned = ref(false);
const isLoadingWhitelist = ref(false);

// 輸入框內容
const newBanName = ref("");
const newWhitelistName = ref("");

// 分頁切換
const activeTab = ref("online");

const { sendCommand, isConnect } = props.useTerminalHook;

const pingConfig = computed(() => ({
  ip: props.instanceInfo?.config?.pingConfig.ip || "",
  port: props.instanceInfo?.config?.pingConfig.port || 25565
}));

// ---------- 取得線上玩家 ----------
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
      onlinePlayers.value = [];
      if (data.online) message.warn(t("伺服器已開啟但未公開玩家名單"));
    }
  } catch (err) {
    console.error("Fetch players error:", err);
    message.error(t("無法獲取玩家名單"));
  } finally {
    isLoading.value = false;
  }
};

// ---------- 讀取 JSON 檔案（需根據實際後端 API 調整） ----------
const fetchJsonFile = async (fileName: string): Promise<any[]> => {
  try {
    // 方案一：直接嘗試常見的檔案內容 API（可根據後端路徑調整）
    const url = `/api/instances/${props.instanceId}/files/${fileName}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    // 方案二：若方案一失敗，可改用終端指令「whitelist list」或「banlist」解析（本示例跳過）
    console.error(`Failed to load ${fileName}`, err);
    return [];
  }
};

const fetchBanList = async () => {
  isLoadingBanned.value = true;
  try {
    bannedPlayers.value = await fetchJsonFile("banned-players.json");
  } finally {
    isLoadingBanned.value = false;
  }
};

const fetchWhitelist = async () => {
  isLoadingWhitelist.value = true;
  try {
    whitelistPlayers.value = await fetchJsonFile("whitelist.json");
  } finally {
    isLoadingWhitelist.value = false;
  }
};

const refreshRestrictionLists = () => {
  fetchBanList();
  fetchWhitelist();
};

// ---------- 發送指令並自動刷新列表 ----------
const runCommand = async (cmd: string, playerName: string) => {
  const fullCommand = cmd.replace("{player}", playerName);
  if (!isConnect.value) {
    return message.error(t("終端連線尚未就緒，請稍後"));
  }
  try {
    await sendCommand(fullCommand);
    message.success(`${t("指令已發送")}: ${fullCommand}`);
    // 若指令包含 ban/pardon/whitelist，自動刷新限制列表
    if (/^(ban|pardon|whitelist)\b/.test(fullCommand)) {
      setTimeout(() => refreshRestrictionLists(), 1500);
    }
  } catch (err: any) {
    console.error("LazyCloud PlayerManager Command Error:", err);
    const errorMsg = err.message || String(err);
    message.error(`${t("執行失敗")}: ${errorMsg}`);
  }
};

// 手動新增封禁 / 加入白名單
const banByName = async () => {
  const name = newBanName.value.trim();
  if (!name) return message.warning(t("請輸入玩家名稱"));
  if (!isConnect.value) return message.error(t("終端連線尚未就緒"));
  try {
    await sendCommand(`ban ${name}`);
    message.success(`${t("已封禁")}: ${name}`);
    newBanName.value = "";
    setTimeout(() => refreshRestrictionLists(), 1500);
  } catch (err) {
    console.error(err);
    message.error(t("發送命令失敗"));
  }
};

const addToWhitelist = async () => {
  const name = newWhitelistName.value.trim();
  if (!name) return message.warning(t("請輸入玩家名稱"));
  if (!isConnect.value) return message.error(t("終端連線尚未就緒"));
  try {
    await sendCommand(`whitelist add ${name}`);
    message.success(`${t("已加入白名單")}: ${name}`);
    newWhitelistName.value = "";
    setTimeout(() => refreshRestrictionLists(), 1500);
  } catch (err) {
    console.error(err);
    message.error(t("發送命令失敗"));
  }
};

// 解除封禁 / 移除白名單
const unbanPlayer = async (name: string) => {
  if (!isConnect.value) return message.error(t("終端連線尚未就緒"));
  try {
    await sendCommand(`pardon ${name}`);
    message.success(`${t("已解除封禁")}: ${name}`);
    setTimeout(() => refreshRestrictionLists(), 1500);
  } catch (err) {
    console.error(err);
    message.error(t("發送命令失敗"));
  }
};

const removeFromWhitelist = async (name: string) => {
  if (!isConnect.value) return message.error(t("終端連線尚未就緒"));
  try {
    await sendCommand(`whitelist remove ${name}`);
    message.success(`${t("已從白名單移除")}: ${name}`);
    setTimeout(() => refreshRestrictionLists(), 1500);
  } catch (err) {
    console.error(err);
    message.error(t("發送命令失敗"));
  }
};

// ---------- 輔助函式 ----------
const isOp = (name: string) => opPlayers.value.includes(name);
const getAvatar = (name: string) => `https://minotar.net/avatar/${name}/32`;

const openDialog = () => {
  open.value = true;
  activeTab.value = "online";
  fetchPlayers();
  refreshRestrictionLists();
};

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
            <template #title>
              {{ t("數據可能有 1-5 分鐘延遲，取決於 API 緩存時間") }}
            </template>
            <a-button type="link" size="small" :loading="isLoading" @click="fetchPlayers">
              <template #icon><ReloadOutlined /></template>
              {{ t("重新整理") }}
            </a-button>
          </a-tooltip>
        </div>
        <a-divider style="margin: 12px 0" />
        <a-list :data-source="onlinePlayers" :loading="isLoading">
          <template #renderItem="{ item }">
            <a-list-item>
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
                  <a-button-group :disabled="!isConnect">
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
                      <a-button danger><DisconnectOutlined /></a-button>
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
      </a-tab-pane>

      <!-- 封禁管理 -->
      <a-tab-pane key="banned" :tab="t('封禁管理')">
        <div class="header-actions">
          <a-typography-text type="secondary">
            <StopOutlined /> {{ t("已封禁玩家") }}: {{ bannedPlayers.length }}
          </a-typography-text>
          <a-button type="link" size="small" :loading="isLoadingBanned" @click="fetchBanList">
            <template #icon><ReloadOutlined /></template>
            {{ t("重新整理") }}
          </a-button>
        </div>
        <a-divider style="margin: 12px 0" />
        <a-list
          :data-source="bannedPlayers"
          :loading="isLoadingBanned"
          :locale="{ emptyText: t('暫無被封禁的玩家') }"
        >
          <template #renderItem="{ item }">
            <a-list-item>
              <div class="player-card">
                <div class="player-identity">
                  <a-avatar :src="getAvatar(item.name)" />
                  <div class="player-name-group">
                    <span>{{ item.name }}</span>
                    <a-tag v-if="item.reason" color="orange">{{ item.reason }}</a-tag>
                  </div>
                </div>
                <div class="player-ops">
                  <a-button
                    type="link"
                    danger
                    :disabled="!isConnect"
                    @click="unbanPlayer(item.name)"
                  >
                    <template #icon><UndoOutlined /></template>
                    {{ t("解除封禁") }}
                  </a-button>
                </div>
              </div>
            </a-list-item>
          </template>
        </a-list>
        <a-divider />
        <a-input-group compact>
          <a-input
            v-model:value="newBanName"
            :placeholder="t('輸入玩家名稱封禁')"
            style="width: calc(100% - 80px)"
          />
          <a-button type="primary" danger :disabled="!isConnect" @click="banByName">
            <template #icon><StopOutlined /></template>
            {{ t("封禁") }}
          </a-button>
        </a-input-group>
      </a-tab-pane>

      <!-- 白名單管理 -->
      <a-tab-pane key="whitelist" :tab="t('白名單管理')">
        <div class="header-actions">
          <a-typography-text type="secondary">
            <SolutionOutlined /> {{ t("白名單玩家") }}: {{ whitelistPlayers.length }}
          </a-typography-text>
          <a-button type="link" size="small" :loading="isLoadingWhitelist" @click="fetchWhitelist">
            <template #icon><ReloadOutlined /></template>
            {{ t("重新整理") }}
          </a-button>
        </div>
        <a-divider style="margin: 12px 0" />
        <a-list
          :data-source="whitelistPlayers"
          :loading="isLoadingWhitelist"
          :locale="{ emptyText: t('白名單為空') }"
        >
          <template #renderItem="{ item }">
            <a-list-item>
              <div class="player-card">
                <div class="player-identity">
                  <a-avatar :src="getAvatar(item.name)" />
                  <span>{{ item.name }}</span>
                </div>
                <div class="player-ops">
                  <a-button
                    type="link"
                    danger
                    :disabled="!isConnect"
                    @click="removeFromWhitelist(item.name)"
                  >
                    <template #icon><DeleteOutlined /></template>
                    {{ t("刪除") }}
                  </a-button>
                </div>
              </div>
            </a-list-item>
          </template>
        </a-list>
        <a-divider />
        <a-input-group compact>
          <a-input
            v-model:value="newWhitelistName"
            :placeholder="t('輸入玩家名稱加入白名單')"
            style="width: calc(100% - 80px)"
          />
          <a-button type="primary" :disabled="!isConnect" @click="addToWhitelist">
            <template #icon><SolutionOutlined /></template>
            {{ t("新增") }}
          </a-button>
        </a-input-group>
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
    .is-op { color: #ff4d4f; font-weight: bold; }
  }
}
.ml-12 { margin-left: 12px; }

@media (max-width: 768px) {
  .player-card {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
  .player-ops {
    width: 100%;
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
