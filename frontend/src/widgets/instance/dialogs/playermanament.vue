<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { t } from "@/lang/i18n";
import type { InstanceDetail } from "@/types";
import { message } from "ant-design-vue";
import { useTerminal } from "../../hooks/useTerminal";
import {
  UserOutlined,
  CrownOutlined,
  StopOutlined,
  LogoutOutlined,
  ThunderboltOutlined,
  SafetyCertificateOutlined
} from "@ant-design/icons-vue";

const props = defineProps<{
  instanceInfo?: InstanceDetail;
  instanceId?: string;
  daemonId?: string;
}>();

// 獲取發送指令的 Hook
const { sendCommand } = useTerminal();

const onlinePlayers = ref<any[]>([]);
const opPlayers = ref<string[]>([]); // 這裡可以從插件配置文件獲取，或手動維護
const isLoading = ref(false);

// 1. 獲取 Ping 配置
const pingConfig = computed(() => ({
  ip: props.instanceInfo?.config?.pingConfig.ip || "127.0.0.1",
  port: props.instanceInfo?.config?.pingConfig.port || 25565
}));

// 2. 刷新玩家列表 (使用 mcapi.us 或相似服務)
const fetchPlayers = async () => {
  isLoading.value = true;
  try {
    const res = await fetch(`https://api.mcstatus.io/v2/status/java/${pingConfig.value.ip}:${pingConfig.value.port}`);
    const data = await res.json();
    if (data.players && data.players.list) {
      onlinePlayers.value = data.players.list;
    } else {
      onlinePlayers.value = [];
    }
  } catch (err) {
    console.error("無法獲取玩家名單", err);
  } finally {
    isLoading.value = false;
  }
};

// 3. 發送指令函數
const runCommand = (cmd: string, playerName: string) => {
  const fullCommand = cmd.replace("{player}", playerName);
  sendCommand(fullCommand);
  message.success(`${t("指令已發送")}: ${fullCommand}`);
};

// 判斷是否為 OP (這裡簡單示範邏輯，實際可對接後端)
const isOp = (name: string) => opPlayers.value.includes(name);

// 獲取頭像 URL
const getAvatar = (name: string) => `https://minotar.net/avatar/${name}/32`;

onMounted(() => {
  fetchPlayers();
});
</script>

<template>
  <div class="player-management">
    <div class="flex-between mb-16">
      <a-typography-title :level="5">
        <UserOutlined /> {{ t("在線玩家管理") }} ({{ onlinePlayers.length }})
      </a-typography-title>
      <a-button type="primary" size="small" :loading="isLoading" @click="fetchPlayers">
        {{ t("刷新名單") }}
      </a-button>
    </div>

    <a-divider style="margin: 12px 0" />

    <a-list :data-source="onlinePlayers" :loading="isLoading">
      <template #renderItem="{ item }">
        <a-list-item>
          <div class="player-item-wrapper flex-between w-100">
            <div class="player-info flex-align-center">
              <a-avatar :src="getAvatar(item.name_raw || item.name)" class="mr-12" />
              <span :class="{ 'op-text': isOp(item.name_raw || item.name) }">
                {{ item.name_raw || item.name }}
                <a-tag v-if="isOp(item.name_raw || item.name)" color="error" size="small" class="ml-4">OP</a-tag>
              </span>
            </div>

            <div class="player-actions">
              <a-button-group size="small">
                <a-tooltip :title="t('設為管理員')">
                  <a-button @click="runCommand('op {player}', item.name_raw || item.name)">
                    <template #icon><CrownOutlined /></template>
                  </a-button>
                </a-tooltip>

                <a-tooltip :title="t('生存模式')">
                  <a-button @click="runCommand('gamemode survival {player}', item.name_raw || item.name)">
                    S
                  </a-button>
                </a-tooltip>
                <a-tooltip :title="t('創造模式')">
                  <a-button @click="runCommand('gamemode creative {player}', item.name_raw || item.name)">
                    C
                  </a-button>
                </a-tooltip>

                <a-popconfirm :title="t('確定要踢出該玩家？')" @confirm="runCommand('kick {player}', item.name_raw || item.name)">
                  <a-button danger>
                    <template #icon><LogoutOutlined /></template>
                  </a-button>
                </a-popconfirm>

                <a-popconfirm :title="t('確定要封禁該玩家？')" @confirm="runCommand('ban {player}', item.name_raw || item.name)">
                  <a-button danger type="primary">
                    <template #icon><StopOutlined /></template>
                  </a-button>
                </a-popconfirm>
              </a-button-group>
            </div>
          </div>
        </a-list-item>
      </template>
      <template #empty>
        <a-empty :description="t('當前無玩家在線或伺服器未開啟玩家列表顯示')" />
      </template>
    </a-list>
  </div>
</script>

<style lang="scss" scoped>
.player-management {
  background: var(--color-gray-1);
  padding: 16px;
  border-radius: 8px;
}

.player-item-wrapper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.flex-align-center {
  display: flex;
  align-items: center;
}

.op-text {
  color: #ff4d4f; /* OP 玩家名字變紅 */
  font-weight: bold;
}

.mr-12 { margin-right: 12px; }
.ml-4 { margin-left: 4px; }
.mb-16 { margin-bottom: 16px; }
.w-100 { width: 100%; }

.player-actions {
  .ant-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
}
</style>
