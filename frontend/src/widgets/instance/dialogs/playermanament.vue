<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { t } from "@/lang/i18n";
import type { InstanceDetail } from "@/types";
import { message } from "ant-design-vue";
// 修正路徑：從 dialogs 目錄退回 hooks 目錄
import { useTerminal } from "../../../hooks/useTerminal";
import {
  UserOutlined,
  CrownOutlined,
  StopOutlined,
  LogoutOutlined,
  CheckOutlined,
  CloseOutlined
} from "@ant-design/icons-vue";

const props = defineProps<{
  instanceInfo?: InstanceDetail;
  instanceId?: string;
  daemonId?: string;
}>();

const { sendCommand } = useTerminal();

const onlinePlayers = ref<any[]>([]);
const isLoading = ref(false);

// 模擬 OP 列表（未來可對接 API）
const opPlayers = ref<string[]>([]);

const pingConfig = computed(() => ({
  ip: props.instanceInfo?.config?.pingConfig.ip || "127.0.0.1",
  port: props.instanceInfo?.config?.pingConfig.port || 25565
}));

const fetchPlayers = async () => {
  if (!pingConfig.value.ip) return;
  isLoading.value = true;
  try {
    // 使用公共 API 獲取玩家列表
    const res = await fetch(`https://api.mcstatus.io/v2/status/java/${pingConfig.value.ip}:${pingConfig.value.port}`);
    const data = await res.json();
    if (data.online && data.players && data.players.list) {
      onlinePlayers.value = data.players.list;
    } else {
      onlinePlayers.value = [];
    }
  } catch (err) {
    console.error("Fetch players error:", err);
  } finally {
    isLoading.value = false;
  }
};

const runCommand = (cmd: string, playerName: string) => {
  const fullCommand = cmd.replace("{player}", playerName);
  sendCommand(fullCommand);
  message.success(`${t("TXT_CODE_d3de39b4")}: ${fullCommand}`);
};

const isOp = (name: string) => opPlayers.value.includes(name);
const getAvatar = (name: string) => `https://minotar.net/avatar/${name}/32`;

onMounted(() => {
  fetchPlayers();
});
</script>

<template>
  <div class="player-management">
    <div class="flex-between mb-16" style="display: flex; justify-content: space-between; align-items: center;">
      <a-typography-title :level="5" class="ma-0">
        <UserOutlined /> {{ t("在線玩家") }} ({{ onlinePlayers.length }})
      </a-typography-title>
      <a-button type="primary" size="small" :loading="isLoading" @click="fetchPlayers">
        {{ t("刷新") }}
      </a-button>
    </div>

    <a-divider style="margin: 12px 0" />

    <a-list :data-source="onlinePlayers" :loading="isLoading">
      <template #renderItem="{ item }">
        <a-list-item>
          <div class="player-item-wrapper">
            <div class="player-info">
              <a-avatar :src="getAvatar(item.name_raw || item.name)" />
              <span class="ml-12" :class="{ 'op-text': isOp(item.name_raw || item.name) }">
                {{ item.name_raw || item.name }}
                <a-tag v-if="isOp(item.name_raw || item.name)" color="red" size="small" class="ml-4">OP</a-tag>
              </span>
            </div>

            <div class="player-actions">
              <a-button-group size="small">
                <a-tooltip :title="t('設為 OP')">
                  <a-button @click="runCommand('op {player}', item.name_raw || item.name)">
                    <template #icon><CrownOutlined /></template>
                  </a-button>
                </a-tooltip>
                <a-tooltip :title="t('生存模式')">
                  <a-button @click="runCommand('gamemode survival {player}', item.name_raw || item.name)">S</a-button>
                </a-tooltip>
                <a-tooltip :title="t('創造模式')">
                  <a-button @click="runCommand('gamemode creative {player}', item.name_raw || item.name)">C</a-button>
                </a-tooltip>
                <a-popconfirm :title="t('確定踢出？')" @confirm="runCommand('kick {player}', item.name_raw || item.name)">
                  <a-button danger><LogoutOutlined /></a-button>
                </a-popconfirm>
                <a-popconfirm :title="t('確定封禁？')" @confirm="runCommand('ban {player}', item.name_raw || item.name)">
                  <a-button danger type="primary"><StopOutlined /></a-button>
                </a-popconfirm>
              </a-button-group>
            </div>
          </div>
        </a-list-item>
      </template>
    </a-list>
    
    <div v-if="!isLoading && onlinePlayers.length === 0" class="mt-20 text-center">
      <a-empty :description="t('當前無玩家在線')" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.player-item-wrapper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.player-info {
  display: flex;
  align-items: center;
}

.op-text {
  color: #ff4d4f;
  font-weight: bold;
}

.ml-12 { margin-left: 12px; }
.ml-4 { margin-left: 4px; }
.mb-16 { margin-bottom: 16px; }
.mt-20 { margin-top: 20px; }
.text-center { text-align: center; }
.ma-0 { margin: 0; }
</style>
