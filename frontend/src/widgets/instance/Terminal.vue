<script setup lang="ts">
import { ref, computed, nextTick } from "vue";
import CardPanel from "@/components/CardPanel.vue";
import { openMarketDialog, openRenewalDialog } from "@/components/fc";
import TerminalCore from "@/components/TerminalCore.vue";
import TerminalTags from "@/components/TerminalTags.vue";
import { useLayoutCardTools } from "@/hooks/useCardTools";
import { INSTANCE_TYPE_TRANSLATION, verifyEULA } from "@/hooks/useInstance";
import { useScreen } from "@/hooks/useScreen";
import { t } from "@/lang/i18n";
import {
  killInstance,
  openInstance,
  restartInstance,
  stopInstance,
  updateInstance
} from "@/services/apis/instance";
import { fileContent } from "@/services/apis/fileManager";
import { useAppStateStore } from "@/stores/useAppStateStore";
import { sleep } from "@/tools/common";
import { reportErrorMsg } from "@/tools/validator";
import type { LayoutCard } from "@/types";
import { INSTANCE_STATUS } from "@/types/const";
import {
  ApartmentOutlined,
  BlockOutlined,
  CheckCircleOutlined,
  CloseOutlined,
  CloudDownloadOutlined,
  CloudServerOutlined,
  DashboardOutlined,
  DownOutlined,
  InfoCircleOutlined,
  InteractionOutlined,
  LaptopOutlined,
  LoadingOutlined,
  MoneyCollectOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  RedoOutlined,
  RobotOutlined,
  SendOutlined,
  UserOutlined,
  ReloadOutlined,
} from "@ant-design/icons-vue";
import { useLocalStorage } from "@vueuse/core";
import prettyBytes, { type Options as PrettyOptions } from "pretty-bytes";
import type { TagInfo } from "../../components/interface";
import { GLOBAL_INSTANCE_NAME } from "../../config/const";
import { useTerminal, type UseTerminalHook } from "../../hooks/useTerminal";
import { arrayFilter } from "../../tools/array";
import { message } from "ant-design-vue";

const props = defineProps<{
  card: LayoutCard;
}>();

const { isPhone } = useScreen();
const { state, isAdmin } = useAppStateStore();
const { getMetaOrRouteValue } = useLayoutCardTools(props.card);
const terminalHook: UseTerminalHook = useTerminal();
const {
  state: instanceInfo,
  isStopped,
  isRunning,
  isBuys,
  isGlobalTerminal,
  isDockerMode,
  clearTerminal,
  sendCommand,
  isConnect
} = terminalHook;

const instanceId = getMetaOrRouteValue("instanceId");
const daemonId = getMetaOrRouteValue("daemonId");
const viewType = getMetaOrRouteValue("viewType", false);
const innerTerminalType = computed(() => props.card.width === 12 && viewType === "inner");
const instanceTypeText = computed(
  () => INSTANCE_TYPE_TRANSLATION[instanceInfo.value?.config.type ?? -1]
);

// --- 日誌過濾功能（原封不動）---
const terminalCoreRef = ref();
const activeTab = ref("default");
const { execute: fetchFile } = fileContent();
const handleTabChange = async () => {
  if (activeTab.value === "default") {
    await nextTick();
    terminalCoreRef.value?.showDefaultView();
  } else {
    terminalCoreRef.value?.showLogView("", true);
    try {
      const res: any = await fetchFile({
        params: { daemonId: daemonId ?? "", uuid: instanceId ?? "" },
        data: { target: "logs/latest.log" }
      });
      let rawText = "";
      if (typeof res === "string") rawText = res;
      else if (res && typeof res === "object") {
        rawText = res._value || res.value || res.data || res.content || "";
      }
      const lines = rawText.split(/\r?\n/).slice(-3000);
      const targetLevel = activeTab.value.toUpperCase();
      const resultLines: string[] = [];
      let isCapturing = false;
      const levelRegex = new RegExp(`(\\[|\\/)${targetLevel}(\\]|\\:)`, "i");
      const timestampRegex = /\[.*?\d{2}:\d{2}:\d{2}.*?\]/;
      for (const line of lines) {
        if (!line.trim()) continue;
        const hasTimestamp = timestampRegex.test(line);
        const hasLevel = levelRegex.test(line);
        if (hasTimestamp) {
          if (hasLevel) {
            isCapturing = true;
            resultLines.push(line);
          } else {
            isCapturing = false;
          }
        } else if (isCapturing) {
          resultLines.push(line);
        }
      }
      terminalCoreRef.value?.showLogView(
        resultLines.length > 0 ? resultLines.join("\n") : `--- 未發現 ${targetLevel} ---`,
        false
      );
      await nextTick();
      setTimeout(() => {
        const el = terminalCoreRef.value?.$el;
        if (el) {
          const container = el.querySelector(".static-log-content");
          if (container) {
            container.scrollTop = container.scrollHeight;
          }
        }
      }, 60);
    } catch (err: any) {
      terminalCoreRef.value?.showLogView("此功能目前僅支持 Minecraft Java 版：" + err.message, false);
    }
  }
};

// --- 原有實例操作邏輯 ---
const { execute: requestOpenInstance, isLoading: isOpenInstanceLoading } = openInstance();
const toOpenInstance = async () => {
  clearTerminal();
  try {
    if (instanceInfo.value?.config?.type?.startsWith("minecraft/java")) {
      const flag = await verifyEULA(instanceId ?? "", daemonId ?? "");
      if (!flag) return;
      await sleep(1000);
    }
    await requestOpenInstance({
      params: {
        uuid: instanceId ?? "",
        daemonId: daemonId ?? ""
      }
    });
  } catch (error: any) {
    reportErrorMsg(error);
  }
};
const updateCmd = computed(() => (instanceInfo.value?.config.updateCommand ? true : false));
const instanceStatusText = computed(() => INSTANCE_STATUS[instanceInfo.value?.status ?? -1]);
const quickOperations = computed(() =>
  arrayFilter([
    {
      title: t("TXT_CODE_57245e94"),
      icon: PlayCircleOutlined,
      noConfirm: false,
      type: "default",
      class: "button-color-success",
      click: toOpenInstance,
      props: {},
      condition: () => isStopped.value
    },
    {
      title: t("TXT_CODE_b1dedda3"),
      icon: PauseCircleOutlined,
      type: "default",
      click: async () => {
        try {
          await stopInstance().execute({
            params: {
              uuid: instanceId || "",
              daemonId: daemonId || ""
            }
          });
        } catch (error: any) {
          reportErrorMsg(error);
        }
      },
      props: { danger: true },
      condition: () => isRunning.value
    }
  ])
);
const instanceOperations = computed(() =>
  arrayFilter([
    {
      title: t("TXT_CODE_47dcfa5"),
      icon: RedoOutlined,
      type: "default",
      noConfirm: false,
      click: async () => {
        try {
          await restartInstance().execute({
            params: {
              uuid: instanceId || "",
              daemonId: daemonId || ""
            }
          });
        } catch (error: any) {
          reportErrorMsg(error);
        }
      },
      condition: () => isRunning.value
    },
    {
      title: t("TXT_CODE_7b67813a"),
      icon: CloseOutlined,
      type: "danger",
      class: "color-warning",
      click: async () => {
        try {
          await killInstance().execute({
            params: {
              uuid: instanceId || "",
              daemonId: daemonId || ""
            }
          });
        } catch (error: any) {
          reportErrorMsg(error);
        }
      },
      condition: () => !isStopped.value
    },
    {
      title: t("TXT_CODE_40ca4f2"),
      type: "default",
      icon: CloudDownloadOutlined,
      click: async () => {
        try {
          clearTerminal();
          await updateInstance().execute({
            params: {
              uuid: instanceId || "",
              daemonId: daemonId || "",
              task_name: "update"
            },
            data: {
              time: new Date().getTime()
            }
          });
        } catch (error: any) {
          reportErrorMsg(error);
        }
      },
      condition: () => isStopped.value && updateCmd.value
    },
    {
      title: t("TXT_CODE_b19ed1dd"),
      icon: InteractionOutlined,
      noConfirm: true,
      click: async () => {
        try {
          clearTerminal();
          await openMarketDialog(daemonId ?? "", instanceId ?? "", {
            autoInstall: true,
            onlyDockerTemplate: isDockerMode.value
          });
        } catch (error: any) {}
      },
      props: {},
      condition: () =>
        isStopped.value && (state.settings.allowUsePreset || isAdmin.value) && !isGlobalTerminal.value
    },
    {
      title: t("TXT_CODE_f77093c8"),
      icon: MoneyCollectOutlined,
      noConfirm: true,
      click: async () => {
        await openRenewalDialog(
          instanceInfo.value?.instanceUuid ?? "",
          daemonId ?? "",
          instanceInfo.value?.config.category ?? 0
        );
      },
      props: {},
      condition: () => !!instanceInfo.value?.config?.category
    }
  ])
);
const getInstanceName = computed(() => {
  if (instanceInfo.value?.config.nickname === GLOBAL_INSTANCE_NAME) {
    return t("TXT_CODE_5bdaf23d");
  } else {
    return instanceInfo.value?.config.nickname;
  }
});
const useByteUnit = useLocalStorage("useByteUnit", true);
const prettyBytesConfig: PrettyOptions = {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  binary: true
};
const getUsageColor = (percentage?: number) => {
  percentage = Number(percentage);
  if (percentage > 600) return "error";
  if (percentage > 200) return "warning";
  return "default";
};
const formatMemoryUsage = (usage?: number, limit?: number) => {
  const fUsage = prettyBytes(usage ?? 0, prettyBytesConfig);
  const fLimit = prettyBytes(limit ?? 0, prettyBytesConfig);
  return limit ? `${fUsage} / ${fLimit}` : fUsage;
};
const formatNetworkSpeed = (bytes?: number) =>
  useByteUnit.value
    ? prettyBytes(bytes ?? 0, { ...prettyBytesConfig, binary: false }) + "/s"
    : prettyBytes((bytes ?? 0) * 8, { ...prettyBytesConfig, bits: true, binary: false }).replace(
        /bit$/,
        "b"
      ) + "ps";
const terminalTopTags = computed<TagInfo[]>(() => {
  const info = instanceInfo.value?.info;
  if (!info || isStopped.value) return [];
  const { cpuUsage, memoryUsage, memoryLimit, memoryUsagePercent, rxBytes, txBytes } = info;
  return arrayFilter<TagInfo>([
    {
      label: t("TXT_CODE_b862a158"),
      value: `${parseInt(String(cpuUsage))}%`,
      color: getUsageColor(cpuUsage),
      icon: BlockOutlined,
      condition: () => cpuUsage != null
    },
    {
      label: t("TXT_CODE_593ee330"),
      value: formatMemoryUsage(memoryUsage, memoryLimit),
      color: getUsageColor(memoryUsagePercent),
      icon: DashboardOutlined,
      condition: () => memoryUsage != null
    },
    {
      label: t("TXT_CODE_50daec4"),
      value: `↓${formatNetworkSpeed(rxBytes)} · ↑${formatNetworkSpeed(txBytes)}`,
      icon: ApartmentOutlined,
      condition: () => rxBytes != null || txBytes != null,
      onClick: () => {
        useByteUnit.value = !useByteUnit.value;
      }
    }
  ]);
});

// ===================== AI 自然語言指令轉換 =====================
const showAiModal = ref(false);
const nlInput = ref("");
const isParsing = ref(false);
const aiError = ref("");

// AI 回傳的結果
const aiCommands = ref<string[]>([]);
const aiExplanation = ref("");

interface OnlinePlayer {
  name: string;
  uuid?: string;
}
const onlinePlayers = ref<OnlinePlayer[]>([]);
const isLoadingPlayers = ref(false);

// ⚠️ 請修改為你自己的 Cloudflare Worker 地址
const WORKER_URL = "https://aicommand.lazycloud.one/api/parse-command";

const mcVersion = computed(() => instanceInfo.value?.info?.version || "未知");

const pingConfig = computed(() => ({
  ip: instanceInfo.value?.config?.pingConfig?.ip || "",
  port: instanceInfo.value?.config?.pingConfig?.port || 25565
}));

const fetchPlayers = async () => {
  if (!pingConfig.value.ip) {
    message.warning("未配置服务器 IP");
    return;
  }
  isLoadingPlayers.value = true;
  try {
    const res = await fetch(
      `https://api.mcstatus.io/v2/status/java/${pingConfig.value.ip}:${pingConfig.value.port}?t=${Date.now()}`
    );
    const data = await res.json();
    if (data.online && data.players?.list) {
      onlinePlayers.value = data.players.list.map((p: any) => ({
        name: p.name_raw || p.name,
        uuid: p.uuid
      }));
    } else {
      onlinePlayers.value = [];
      if (!data.online) message.warning("服务器离线");
      else if (data.players?.list?.length === 0) message.info("暂无在线玩家");
    }
  } catch (err) {
    console.error(err);
    message.error("获取玩家列表失败");
  } finally {
    isLoadingPlayers.value = false;
  }
};

const insertPlayerName = (name: string) => {
  nlInput.value += ` ${name} `;
};

const openAiModal = () => {
  showAiModal.value = true;
  nlInput.value = "";
  aiError.value = "";
  aiCommands.value = [];
  aiExplanation.value = "";
  fetchPlayers();
};

// 發送單條指令
const handleSendCommand = async (cmd: string) => {
  try {
    await sendCommand(cmd);
    message.success(`已发送：${cmd}`);
  } catch (err: any) {
    message.error("指令发送失败: " + err.message);
  }
};

// 解析自然語言
const parseCommand = async () => {
  const text = nlInput.value.trim();
  if (!text) return;
  if (!isRunning.value) {
    aiError.value = "实例未运行，无法发送指令";
    return;
  }

  isParsing.value = true;
  aiError.value = "";
  aiCommands.value = [];
  aiExplanation.value = "";

  try {
    const response = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, version: mcVersion.value })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    if (data.success && data.commands?.length > 0) {
      aiCommands.value = data.commands;
      aiExplanation.value = data.explanation || "";
    } else {
      aiError.value = data.error || "无法解析该指令，请尝试更清晰的描述";
    }
  } catch (err: any) {
    console.error(err);
    aiError.value = "AI 服务连接失败，请稍后重试";
  } finally {
    isParsing.value = false;
  }
};
</script>

<template>
  <!-- 內部終端視圖 -->
  <div v-if="innerTerminalType">
    <div class="mb-24">
      <BetweenMenus>
        <template #left>
          <div class="align-center">
            <a-typography-title class="mb-0 mr-12" :level="4">
              <CloudServerOutlined />
              <span class="ml-6"> {{ getInstanceName }} </span>
            </a-typography-title>
            <a-typography-paragraph v-if="!isPhone" class="mb-0 ml-4">
              <span class="ml-6">
                <a-tag v-if="isRunning" color="green">
                  <CheckCircleOutlined />
                  {{ instanceStatusText }}
                </a-tag>
                <a-tag v-else-if="isBuys" color="red">
                  <LoadingOutlined />
                  {{ instanceStatusText }}
                </a-tag>
                <a-tag v-else-if="instanceStatusText">
                  <InfoCircleOutlined />
                  {{ instanceStatusText }}
                </a-tag>
              </span>
              <a-tag v-if="instanceTypeText" color="purple"> {{ instanceTypeText }} </a-tag>
              <span
                v-if="isAdmin && instanceInfo?.watcher && instanceInfo?.watcher > 1"
                class="ml-16"
              >
                <a-tooltip>
                  <template #title>{{ t("TXT_CODE_4a37ec9c") }}</template>
                  <LaptopOutlined />
                </a-tooltip>
                <span class="ml-6" style="opacity: 0.8">{{ instanceInfo?.watcher }}</span>
              </span>
            </a-typography-paragraph>
          </div>
        </template>
        <template #right>
          <div v-if="!isPhone">
            <template
              v-for="item in [...quickOperations, ...instanceOperations]"
              :key="item.title"
            >
              <a-button
                v-if="item.noConfirm"
                class="ml-8"
                :class="item.class ? item.class : ''"
                :danger="item.type === 'danger'"
                :disabled="isOpenInstanceLoading"
                @click="item.click"
              >
                <component :is="item.icon" />
                {{ item.title }}
              </a-button>
              <a-popconfirm
                v-else
                :key="item.title"
                :title="t('TXT_CODE_276756b2')"
                @confirm="item.click"
              >
                <a-button
                  class="ml-8"
                  :danger="item.type === 'danger'"
                  :class="item.class ? item.class : ''"
                >
                  <component :is="item.icon" />
                  {{ item.title }}
                </a-button>
              </a-popconfirm>
            </template>
          </div>
          <a-dropdown v-else>
            <template #overlay>
              <a-menu>
                <a-menu-item
                  v-for="item in [...quickOperations, ...instanceOperations]"
                  :key="item.title"
                  @click="item.click"
                >
                  <component :is="item.icon" />
                  <span class="ml-8">{{ item.title }}</span>
                </a-menu-item>
              </a-menu>
            </template>
            <a-button type="primary">
              {{ t("TXT_CODE_fe731dfc") }} <DownOutlined />
            </a-button>
          </a-dropdown>
        </template>
      </BetweenMenus>
    </div>

    <div class="mb-10 status-bar-flex">
      <div class="status-left">
        <a-radio-group v-model:value="activeTab" size="small" @change="handleTabChange">
          <a-radio-button value="default">{{ t("控制台") }}</a-radio-button>
          <a-radio-button value="warn">WARN</a-radio-button>
          <a-radio-button value="error">ERROR</a-radio-button>
        </a-radio-group>
      </div>
      <div class="status-right">
        <TerminalTags :tags="terminalTopTags" />
      </div>
    </div>

    <!-- TerminalCore 內含 AI 按鈕，emit 'open-ai' -->
    <TerminalCore
      v-if="instanceId && daemonId"
      ref="terminalCoreRef"
      :use-terminal-hook="terminalHook"
      :instance-id="instanceId"
      :daemon-id="daemonId"
      :height="card.height"
      @open-ai="openAiModal"
    />
  </div>

  <!-- 外部卡片視圖 -->
  <CardPanel v-else class="containerWrapper" style="height: 100%">
    <template #title>
      <CloudServerOutlined />
      <span class="ml-8"> {{ getInstanceName }} </span>
    </template>

    <template #operator> </template>

    <template #body>
      <div class="mb-6 status-bar-flex">
        <div class="status-left">
          <a-radio-group v-model:value="activeTab" size="small" @change="handleTabChange">
            <a-radio-button value="default">{{ t("控制台") }}</a-radio-button>
            <a-radio-button value="warn">WARN</a-radio-button>
            <a-radio-button value="error">ERROR</a-radio-button>
          </a-radio-group>
        </div>
        <div class="status-right">
          <TerminalTags :tags="terminalTopTags" />
        </div>
      </div>
      <TerminalCore
        v-if="instanceId && daemonId"
        ref="terminalCoreRef"
        :use-terminal-hook="terminalHook"
        :instance-id="instanceId"
        :daemon-id="daemonId"
        :height="card.height"
        @open-ai="openAiModal"
      />
    </template>
  </CardPanel>

  <!-- AI 自然語言轉換窗口（原生 UI） -->
  <a-modal
    v-model:open="showAiModal"
    title="自然语言转 Minecraft 指令"
    :footer="null"
    :width="580"
    destroy-on-close
  >
    <div class="ai-modal-container">
      <!-- 版本信息 -->
      <a-space class="version-info">
        <a-tag color="processing">Minecraft {{ mcVersion }}</a-tag>
        <span class="text-muted">AI 将根据此版本生成指令</span>
      </a-space>

      <!-- 輸入框 -->
      <a-input
        v-model:value="nlInput"
        placeholder="描述你想执行的操作，例如：把玩家 Tom 传送到 0 64 0，再给他一个钻石剑"
        :disabled="isParsing"
        allow-clear
      />

      <!-- 操作按鈕行 -->
      <a-space :size="12" class="action-row">
        <a-button
          type="primary"
          :loading="isParsing"
          :disabled="!nlInput.trim() || isParsing"
          @click="parseCommand"
        >
          <template #icon><SendOutlined /></template>
          解析
        </a-button>
        <a-button :loading="isLoadingPlayers" @click="fetchPlayers">
          <template #icon><ReloadOutlined /></template>
          刷新玩家
        </a-button>
      </a-space>

      <!-- 錯誤提示 -->
      <a-alert
        v-if="aiError"
        type="error"
        :message="aiError"
        show-icon
        closable
        @close="aiError = ''"
      />

      <!-- AI 解析結果卡片 -->
      <a-card
        v-if="aiCommands.length > 0"
        size="small"
        title="AI 解析结果"
        class="result-card"
      >
        <template #extra>
          <a-tag color="blue">{{ aiCommands.length }} 条指令</a-tag>
        </template>

        <a-typography-paragraph type="secondary">
          {{ aiExplanation }}
        </a-typography-paragraph>

        <a-list :data-source="aiCommands" :split="false" size="small">
          <template #renderItem="{ item }">
            <a-list-item>
              <div class="command-item">
                <code class="command-code">{{ item }}</code>
                <a-button
                  type="link"
                  size="small"
                  :disabled="!isConnect"
                  @click="handleSendCommand(item)"
                >
                  <template #icon><SendOutlined /></template>
                  执行
                </a-button>
              </div>
            </a-list-item>
          </template>
        </a-list>
      </a-card>

      <!-- 線上玩家卡片 -->
      <a-card size="small" title="在线玩家" class="player-card">
        <template #extra>
          <a-button type="link" size="small" :loading="isLoadingPlayers" @click="fetchPlayers">
            <ReloadOutlined />
          </a-button>
        </template>

        <a-list
          v-if="onlinePlayers.length > 0"
          :data-source="onlinePlayers"
          :grid="{ gutter: 8, column: 3 }"
          :split="false"
        >
          <template #renderItem="{ item: player }">
            <a-list-item>
              <a-button type="text" block @click="insertPlayerName(player.name)">
                <a-avatar
                  :src="`https://minotar.net/avatar/${player.name}/32`"
                  :size="20"
                  shape="circle"
                  class="player-avatar"
                />
                {{ player.name }}
              </a-button>
            </a-list-item>
          </template>
        </a-list>
        <a-empty v-else description="暂无在线玩家" :image-style="{ height: '40px' }" />
      </a-card>
    </div>
  </a-modal>
</template>

<style lang="scss" scoped>
/* 原有樣式完整保留 */
.error-card {
  position: absolute;
  inset: 0;
  z-index: 10;
  border-radius: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  .error-card-container {
    overflow: hidden;
    max-width: 440px;
    border: 1px solid var(--color-gray-6) !important;
    background-color: var(--color-gray-1);
    border-radius: 4px;
    padding: 12px;
    box-shadow: 0px 0px 2px var(--color-gray-7);
  }
  @media (max-width: 992px) {
    .error-card-container { max-width: 90vw !important; }
  }
}
.status-bar-flex {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}
:deep(.ant-radio-button-wrapper) {
  height: 24px;
  line-height: 22px;
  padding: 0 12px;
  font-size: 12px;
  background: transparent;
  border-color: var(--card-border-color);
  &:first-child { border-radius: 4px 0 0 4px; }
  &:last-child { border-radius: 0 4px 4px 0; }
}
.console-wrapper {
  position: relative;
  height: 100%;
  width: 100%;
}
.align-center {
  display: flex;
  align-items: center;
}

/* AI 視窗容器 */
.ai-modal-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.version-info {
  display: flex;
  align-items: center;
}

.text-muted {
  color: var(--color-text-secondary);
  font-size: 13px;
}

.action-row {
  display: flex;
  justify-content: space-between;
}

/* 結果卡片 */
.result-card {
  :deep(.ant-card-head) {
    min-height: 36px;
    padding: 0 12px;
  }
  :deep(.ant-card-body) {
    padding: 12px;
  }
}

.command-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 8px;
}

.command-code {
  background: #f5f5f5;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 13px;
  flex: 1;
  word-break: break-all;
  color: #000;
}

/* 玩家卡片 */
.player-card {
  :deep(.ant-card-head) {
    min-height: 36px;
    padding: 0 12px;
  }
  :deep(.ant-card-body) {
    padding: 8px;
  }
}

.player-avatar {
  margin-right: 6px;
}

/* 通用工具類 */
.ml-16 { margin-left: 16px; }
.ml-8 { margin-left: 8px; }
.mb-10 { margin-bottom: 10px; }
.mb-6 { margin-bottom: 6px; }
.mb-24 { margin-bottom: 24px; }
.ml-12 { margin-left: 12px; }
.mr-12 { margin-right: 12px; }
</style>
