<script setup lang="ts">
import { ref, computed } from "vue";
import { t } from "@/lang/i18n";
import type { InstanceDetail } from "@/types";
import { message } from "ant-design-vue";
// 引入類型定義，不重新建立 Hook
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
  CrownFilled
} from "@ant-design/icons-vue";

// 增加 useTerminalHook 作為 Prop 傳入，這樣才能共用父組件已連線的 Socket
const props = defineProps<{
  instanceInfo?: InstanceDetail;
  instanceId?: string;
  daemonId?: string;
  useTerminalHook: UseTerminalHook; 
}>();

const open = ref(false);
const onlinePlayers = ref<any[]>([]);
const isLoading = ref(false);

// 模擬 OP 列表
const opPlayers = ref<string[]>([]); 

// 從父組件傳進來的 Hook 中解構出發送指令的方法
const { sendCommand, isConnect } = props.useTerminalHook;

const pingConfig = computed(() => ({
  ip: props.instanceInfo?.config?.pingConfig.ip || "",
  port: props.instanceInfo?.config?.pingConfig.port || 25565
}));

const fetchPlayers = async () => {
  if (!pingConfig.value.ip) return;
  isLoading.value = true;
  try {
    // 加上 ?t=xxx 避免瀏覽器緩存 API 結果
    const res = await fetch(
      `https://api.mcstatus.io/v2/status/java/${pingConfig.value.ip}:${pingConfig.value.port}?t=${Date.now()}`
    );
    const data = await res.json();
    
    // 清空舊數據再賦值，確保響應式更新
    onlinePlayers.value = []; 
    
    if (data.online && data.players && data.players.list) {
      onlinePlayers.value = data.players.list;
    } else {
      onlinePlayers.value = [];
      // 如果獲取不到列表，可能是伺服器隱藏了玩家名單
      if (data.online) message.warn(t("伺服器已開啟但未公開玩家名單"));
    }
  } catch (err) {
    console.error("Fetch players error:", err);
    message.error(t("無法獲取玩家名單"));
  } finally {
    isLoading.value = false;
  }
};

  
// 核心修正：增加 async/await 與 try-catch 攔截「實例沒有在運作」錯誤
const runCommand = async (cmd: string, playerName: string) => {
  const fullCommand = cmd.replace("{player}", playerName);
  
  // 安全檢查：如果 Socket 沒連上，直接攔截
  if (!isConnect.value) {
    return message.error(t("終端連線尚未就緒，請稍後"));
  }

  try {
    // 等待指令發送，若報錯則會進入 catch
    await sendCommand(fullCommand);
    message.success(`${t("指令已發送")}: ${fullCommand}`);
  } catch (err: any) {
    console.error("LazyCloud PlayerManager Command Error:", err);
    // 捕獲錯誤並提示，防止 LayoutCard 崩潰
    const errorMsg = err.message || String(err);
    message.error(`${t("執行失敗")}: ${errorMsg}`);
  }
};

const isOp = (name: string) => opPlayers.value.includes(name);
const getAvatar = (name: string) => `https://minotar.net/avatar/${name}/32`;

const openDialog = () => {
  open.value = true;
  fetchPlayers();
};

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

      </div>
    </div>
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
.empty-state { padding: 40px 0; text-align: center; }
</style>
