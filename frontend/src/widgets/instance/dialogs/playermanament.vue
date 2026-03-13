<script setup lang="ts">
import { ref, computed } from "vue";
import { t } from "@/lang/i18n";
import type { InstanceDetail } from "@/types";
import { message } from "ant-design-vue";
// 確保路徑指向你的 useTerminal hook
import { useTerminal } from "../../../hooks/useTerminal";
import {
  UserOutlined,
  CrownOutlined,
  StopOutlined,
  LogoutOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
  SmileOutlined
} from "@ant-design/icons-vue";

const props = defineProps<{
  instanceInfo?: InstanceDetail;
  instanceId?: string;
  daemonId?: string;
}>();

const { sendCommand } = useTerminal();

const open = ref(false);
const onlinePlayers = ref<any[]>([]);
const isLoading = ref(false);

// 模擬 OP 玩家名單（之後可透過讀取 ops.json 的 API 替換）
const opPlayers = ref<string[]>(["LazyCloud_Admin"]); 

// 獲取 mcping 填寫的配置
const pingConfig = computed(() => ({
  ip: props.instanceInfo?.config?.pingConfig.ip || "",
  port: props.instanceInfo?.config?.pingConfig.port || 25565
}));

// 獲取玩家列表
const fetchPlayers = async () => {
  if (!pingConfig.value.ip) return;
  isLoading.value = true;
  try {
    // 使用公共 API 獲取 Java 版伺服器在線玩家
    const res = await fetch(
      `https://api.mcstatus.io/v2/status/java/${pingConfig.value.ip}:${pingConfig.value.port}`
    );
    const data = await res.json();
    if (data.online && data.players && data.players.list) {
      onlinePlayers.value = data.players.list;
    } else {
      onlinePlayers.value = [];
    }
  } catch (err) {
    console.error("Fetch players error:", err);
    message.error(t("無法連接到 Ping API"));
  } finally {
    isLoading.value = false;
  }
};

// 執行指令
const runCommand = (cmd: string, playerName: string) => {
  const fullCommand = cmd.replace("{player}", playerName);
  sendCommand(fullCommand);
  // 使用你專案中已有的成功提示 i18n key，或直接顯示文字
  message.success(`${t("指令已發送")}: ${fullCommand}`);
};

// 判斷是否為 OP
const isOp = (name: string) => opPlayers.value.includes(name);

// 獲取頭像
const getAvatar = (name: string) => `https://minotar.net/avatar/${name}/32`;

// 打開對話框的方法
const openDialog = () => {
  open.value = true;
  fetchPlayers();
};

// 暴露給父組件 ManagerBtns.vue 呼叫
defineExpose({
  openDialog
});
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
    <div class="player-management-container">
      <div class="header-actions">
        <a-typography-text type="secondary">
          <SmileOutlined /> {{ t("當前在線") }}: {{ onlinePlayers.length }}
        </a-typography-text>
        <a-button type="link" size="small" :loading="isLoading" @click="fetchPlayers">
          <template #icon><ReloadOutlined /></template>
          {{ t("刷新") }}
        </a-button>
      </div>

      <a-divider style="margin: 12px 0" />

      <div class="player-list-wrapper">
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
                  <a-button-group>
                    <a-tooltip :title="t('設為管理員')">
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

                    <a-popconfirm :title="t('確定踢出玩家？')" @confirm="runCommand('kick {player}', item.name_raw || item.name)">
                      <a-button danger><LogoutOutlined /></a-button>
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

        <div v-if="!isLoading && onlinePlayers.length === 0" class="empty-state">
          <a-empty :description="t('暫無在線玩家')" />
        </div>
      </div>
    </div>
  </a-modal>
</template>

<style lang="scss" scoped>
.player-management-container {
  min-height: 300px;
}

.header-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
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
    
    span {
      font-size: 14px;
      font-weight: 500;
    }

    .is-op {
      color: #ff4d4f; /* OP 玩家名字變紅 */
      font-weight: bold;
    }
  }
}

.player-list-wrapper {
  max-height: 450px;
  overflow-y: auto;
}

.empty-state {
  padding: 40px 0;
  text-align: center;
}

// 讓按鈕組在移動端也整齊
.player-ops {
  .ant-btn-group {
    display: flex;
    align-items: center;
  }
}
</style>
