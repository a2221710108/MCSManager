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
      // 修正正则表达式
      const levelRegex = new RegExp('(\\[|\\/)' + targetLevel + '(\\]|\\:)', 'i');
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

// 指令模式結果
const aiCommands = ref<string[]>([]);
const aiExplanation = ref("");

// 分析模式狀態
const aiMode = ref<"command" | "analyze_log">("command");
const logAnalysis = ref("");
const logSuggestions = ref<string[]>([]);

interface OnlinePlayer {
  name: string;
  uuid?: string;
}
const onlinePlayers = ref<OnlinePlayer[]>([]);
const isLoadingPlayers = ref(false);

// ⚠️ 請修改為你自己的 Cloudflare Worker 地址
const WORKER_URL = "https://aicommand.lazycloud.one/api/parse-command";
const ANALYZE_LOG_WORKER_URL = "https://royal-limit-ac63.leolu55165088.workers.dev/api/analyze-log";

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

// 插入玩家姓名格式：玩家："Tom"
const insertPlayerName = (name: string) => {
  nlInput.value += `玩家："${name}" `;
};

const openAiModal = () => {
  aiMode.value = "command";
  showAiModal.value = true;
  nlInput.value = "";
  aiError.value = "";
  aiCommands.value = [];
  aiExplanation.value = "";
  fetchPlayers();
};

// 新增：打開分析模式 (由 TerminalCore 觸發)
const openAiWithLog = (logText: string) => {
  aiMode.value = "analyze_log";
  showAiModal.value = true;
  aiError.value = "";
  logAnalysis.value = "";
  logSuggestions.value = [];
  analyzeLog(logText);
};

// 新增：分析日誌函數
const analyzeLog = async (logText: string) => {
  isParsing.value = true;
  aiError.value = "";
  logAnalysis.value = "";
  logSuggestions.value = [];

  try {
    const response = await fetch(ANALYZE_LOG_WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: logText })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    if (data.success) {
      logAnalysis.value = data.analysis || "";
      logSuggestions.value = data.suggestions || [];
    } else {
      aiError.value = data.error || "分析失败";
    }
  } catch (err: any) {
    console.error(err);
    aiError.value = "AI 服务连接失败，请稍后重试";
  } finally {
    isParsing.value = false;
  }
};

// 發送單條指令（指令模式）
const handleSendCommand = async (cmd: string) => {
  try {
    await sendCommand(cmd);
    message.success(`已发送：${cmd}`);
  } catch (err: any) {
    message.error("指令发送失败: " + err.message);
  }
};

// 解析自然語言（指令模式）
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

    <TerminalCore
      v-if="instanceId && daemonId"
      ref="terminalCoreRef"
      :use-terminal-hook="terminalHook"
      :instance-id="instanceId"
      :daemon-id="daemonId"
      :height="card.height"
      @open-ai="openAiModal"
      @analyze-log="openAiWithLog"
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
        @analyze-log="openAiWithLog"
      />
    </template>
  </CardPanel>

  <!-- AI 窗口 (根據模式顯示不同內容) -->
  <a-modal
    v-model:open="showAiModal"
    :title="aiMode === 'command' ? '自然语言转 Minecraft 指令' : 'AI 日志分析'"
    :footer="null"
    :width="580"
    destroy-on-close
  >
    <div class="ai-modal-container">
      <!-- 指令模式 -->
      <template v-if="aiMode === 'command'">
  <div class="ai-command-wrapper">
    
    <div class="ai-card-panel bg-panel">
      <div class="panel-header-bar">
        <div class="version-display">
          <a-tag color="blue" class="mc-tag">Minecraft {{ mcVersion }}</a-tag>
          <span class="sub-text">AI 將依此版本環境轉換指令</span>
        </div>
      </div>

      <div class="input-form-group">
        <a-textarea
          v-model:value="nlInput"
          placeholder="描述你想执行的操作，例如：将天气设定为雷雨，把玩家 Tom 传送到 0 64 0"
          :disabled="isParsing"
          :rows="3"
          allow-clear
          class="custom-textarea"
        />
      </div>

      <div class="panel-action-row">
        <a-button 
          type="primary" 
          :loading="isParsing" 
          :disabled="!nlInput.trim() || isParsing" 
          @click="parseCommand"
          block
          class="action-submit-btn"
        >
          <template #icon><SendOutlined /></template>
          開始 AI 解析指令
        </a-button>
      </div>
    </div>

    <div v-if="aiError" class="ai-message-wrapper">
      <a-alert
        type="error"
        :message="aiError"
        show-icon
        closable
        @close="aiError = ''"
      />
    </div>

    <div v-if="aiCommands.length > 0" class="ai-card-panel result-panel animate-fade-in">
      <div class="panel-title-sm">
        <info-circle-outlined /> AI 解析思維與步驟
      </div>
      <div class="explanation-box">
        {{ aiExplanation }}
      </div>
      
      <div class="panel-title-sm" style="margin-top: 16px;">
        <code-outlined /> 產出的控制台指令
      </div>
      <div class="command-output-list">
        <div v-for="cmd in aiCommands" :key="cmd" class="command-output-card">
          <div class="cmd-text-wrapper">
            <code class="terminal-cmd">{{ cmd }}</code>
          </div>
          <a-button type="default" size="small" @click="handleSendCommand(cmd)" :disabled="!isConnect" class="cmd-send-btn">
            <template #icon><SendOutlined /></template>
            執行指令
          </a-button>
        </div>
      </div>
    </div>

    <div class="ai-card-panel player-panel">
      <div class="panel-header-bar">
        <div class="panel-title-sm no-margin">
          <span class="title-main"><UserOutlined /> 當前在線玩家</span>
          <span class="title-hint">（點擊名可直接插入）</span>
        </div>
        <a-button type="link" size="small" :loading="isLoadingPlayers" @click="fetchPlayers" class="refresh-link-btn">
          <template #icon><ReloadOutlined /></template>
          刷新玩家
        </a-button>
      </div>
      
      <div v-if="onlinePlayers.length > 0" class="player-grid">
        <div
          v-for="player in onlinePlayers"
          :key="player.uuid || player.name"
          class="player-clickable-card"
          @click="insertPlayerName(player.name)"
        >
          <a-avatar :src="`https://minotar.net/avatar/${player.name}/24`" :size="18" shape="square" />
          <span class="player-name-text">{{ player.name }}</span>
        </div>
      </div>
      
      <div v-else class="player-empty-wrapper">
        <span class="sub-text">暫無在線玩家，您可以直接手動輸入玩家 ID</span>
      </div>
    </div>

  </div>
</template>

      <!-- 分析模式 -->
<template v-else-if="aiMode === 'analyze_log'">
  <div class="ai-analysis-container">
    
    <div v-if="isParsing" class="analysis-loading-wrapper">
      <a-spin tip="MCSM AI 正在深度分析日誌..." size="large" />
    </div>

    <div v-else class="analysis-main-layout animate-fade-in">
      
      <a-alert
        v-if="aiError"
        type="error"
        :message="aiError"
        show-icon
        closable
        class="analysis-alert"
        @close="aiError = ''"
      />

      <div v-if="logAnalysis" class="analysis-report-card">
        <div class="card-header-title">
          <reconciliation-outlined /> AI 崩潰與異常診斷報告
        </div>
        <div class="analysis-text-content">{{ logAnalysis }}</div>
      </div>

      <div v-if="logSuggestions.length > 0" class="suggestions-report-card">
        <div class="card-header-title">
          <bulb-outlined class="icon-warning-theme" /> 建議修復方法
        </div>
        <ul class="suggestion-list-pure">
          <li v-for="(suggestion, index) in logSuggestions" :key="index" class="suggestion-step-item">
            <span class="step-badge">{{ index + 1 }}</span>
            <div class="step-text">{{ suggestion }}</div>
          </li>
        </ul>
      </div>

      <div class="disclaimer-text-muted">
        <info-circle-outlined /> AI 產出的診斷與建議僅供參考，請在修改重要檔案前做好備份。
      </div>
    </div>

    <div class="analysis-action-bar">
      <a-button type="default" @click="showAiModal = false" class="close-panel-btn">
        關閉分析窗口
      </a-button>
    </div>

  </div>
</template>

<style lang="scss" scoped>
/* 原有样式完整保留 */
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

/* AI 窗口容器 */
.ai-modal-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* ============================== */
/* 自然语言转换指令 样式 */
/* ============================== */
.ai-command-wrapper {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 4px 0;
}

/* MCSM 原生風格面板卡片 */
.ai-card-panel {
  background: var(--color-bg-container, #ffffff);
  border: 1px solid var(--border-color-base, #eeeeee);
  border-radius: 4px;
  padding: 16px;
}

/* 特殊底色面板 */
.bg-panel {
  background: var(--color-bg-layout, #fafafa);
  border-color: var(--border-color-split, #e8e8e8);
}

/* 結果面板：已移除 border-left 的藍邊，回歸極簡一體化 */
.result-panel {
  border-left: 1px solid var(--border-color-base, #eeeeee);
}

/* 面板頂部工具列 */
.panel-header-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}

.version-display {
  display: flex;
  align-items: center;
  gap: 10px;
}

.mc-tag {
  border-radius: 2px;
  font-weight: bold;
}

.sub-text {
  color: var(--color-text-secondary, #8c8c8c);
  font-size: 12px;
}

.refresh-link-btn {
  padding: 0;
  font-size: 13px;
}

/* 輸入框表單組 */
.input-form-group {
  margin-bottom: 14px;
}

.custom-textarea {
  border-radius: 4px;
  padding: 10px 12px;
  font-size: 14px;
  resize: none;
}

/* 核心按鈕列 */
.panel-action-row {
  width: 100%;
}

.action-submit-btn {
  height: 38px;
  font-size: 14px;
  font-weight: 500;
  border-radius: 4px;
}

/* 錯誤提示包裹線 */
.ai-message-wrapper {
  margin: -4px 0;
}

/* 小標題樣式 */
.panel-title-sm {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text, #262626);
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.panel-title-sm.no-margin {
  margin-bottom: 0;
}

.title-main {
  font-weight: 600;
}

.title-hint {
  font-weight: normal;
  color: var(--color-text-secondary, #999999);
  font-size: 11px;
}

/* AI 解析思維文字方塊 */
.explanation-box {
  background: var(--color-bg-layout, #f5f5f5);
  padding: 12px;
  border-radius: 4px;
  font-size: 13px;
  color: var(--color-text-secondary, #555555);
  line-height: 1.6;
  border: 1px solid var(--border-color-split, #e8e8e8);
}

/* 指令輸出列表 */
.command-output-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.command-output-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  background: var(--color-bg-layout, #f9f9f9);
  border: 1px solid var(--border-color-base, #e8e8e8);
  padding: 8px 12px;
  border-radius: 4px;
}

.cmd-text-wrapper {
  flex: 1;
  overflow: hidden;
}

.terminal-cmd {
  font-family: monospace, "Courier New", Courier;
  font-size: 13px;
  color: #c41d7f;
  word-break: break-all;
  font-weight: 600;
}

.cmd-send-btn {
  border-radius: 4px;
  flex-shrink: 0;
  background: #ffffff;
}

/* 玩家網格 */
.player-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 8px;
}

.player-clickable-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid var(--border-color-split, #e8e8e8);
  border-radius: 4px;
  background: var(--color-bg-container, #ffffff);
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    border-color: var(--color-primary, #1890ff);
    background: var(--color-primary-light, #f0f7ff);
  }
}

.player-name-text {
  font-size: 12px;
  color: var(--color-text, #262626);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.player-empty-wrapper {
  padding: 16px 0;
  text-align: center;
  border: 1px dashed var(--border-color-split, #e8e8e8);
  border-radius: 4px;
}

/* 動效 */
.animate-fade-in {
  animation: fadeIn 0.3s ease-in-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ============================== */
/* 日志分析 样式 */
/* ============================== */
.ai-analysis-container {
  display: flex;
  flex-direction: column;
  gap: 20px; /* 拉開整體區塊間距，拒絕擁擠 */
  padding: 4px 0;
}

/* 載入狀態優化 */
.analysis-loading-wrapper {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 60px 0;
}

.analysis-main-layout {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.analysis-alert {
  border-radius: 4px;
}

/* MCSM 原生風格卡片面板 */
.analysis-report-card, 
.suggestions-report-card {
  background: var(--color-bg-container, #ffffff);
  border: 1px solid var(--border-color-base, #eeeeee);
  border-radius: 4px;
  padding: 18px; /* 增加留白，讓大段文字更好閱讀 */
}

/* 區塊特殊底色：建議修復區採用輕量有溫度的底色 */
.suggestions-report-card {
  background: var(--color-bg-layout, #fafafa);
  border-color: var(--border-color-split, #e8e8e8);
}

/* 卡片標題樣式 */
.card-header-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text, #262626);
  margin-bottom: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid var(--border-color-split, #f0f0f0);
  padding-bottom: 8px;
}

.icon-warning-theme {
  color: var(--color-warning, #faad14);
}

/* 大段日誌分析文本區 */
.analysis-text-content {
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--color-text, #262626);
  font-size: 13.5px;
  line-height: 1.7; /* 增大行高，防止密密麻麻的文字擠壓 */
}

/* 建議列表重構：去除 <code> 區塊 */
.suggestion-list-pure {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.suggestion-step-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 4px 0;
}

/* 純數位精緻徽章 */
.step-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  background: var(--color-text-secondary, #8c8c8c);
  color: #ffffff;
  font-size: 11px;
  font-weight: bold;
  border-radius: 2px; /* MCSM 硬朗微圓角 */
  flex-shrink: 0;
  margin-top: 2px;
}

.step-text {
  font-size: 13px;
  color: var(--color-text, #262626);
  line-height: 1.5;
  flex: 1;
}

/* 免責聲明輕量化 */
.disclaimer-text-muted {
  color: var(--color-text-secondary, #8c8c8c);
  font-size: 12px;
  text-align: center;
  padding: 8px 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

/* 底部操作列分割 */
.analysis-close-bar,
.analysis-action-bar {
  display: flex;
  justify-content: flex-end; /* 按鈕靠右對齊，符合 MCSM 彈窗操作常規 */
  padding-top: 14px;
  border-top: 1px solid var(--border-color-split, #f0f0f0);
}

.close-panel-btn {
  border-radius: 4px;
  min-width: 100px;
}

/* 動效 */
.animate-fade-in {
  animation: fadeIn 0.25s ease-in-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(2px); }
  to { opacity: 1; transform: translateY(0); }
}
/* ============================== */

.mb-16 {
  margin-bottom: 16px;
}

/* 通用工具类 */
.ml-16 { margin-left: 16px; }
.ml-8 { margin-left: 8px; }
.mb-10 { margin-bottom: 10px; }
.mb-6 { margin-bottom: 6px; }
.mb-24 { margin-bottom: 24px; }
.ml-12 { margin-left: 12px; }
.mr-12 { margin-right: 12px; }
</style>
