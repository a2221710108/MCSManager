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
  ReloadOutlined
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

// --- 日誌過濾功能 ---
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
const isExecuting = ref(false);
const confirmVisible = ref(false);
const aiResult = ref<{ success: boolean; commands: string[]; explanation: string; error?: string } | null>(null);

interface OnlinePlayer {
  name: string;
  uuid?: string;
}
const onlinePlayers = ref<OnlinePlayer[]>([]);
const isLoadingPlayers = ref(false);

const WORKER_URL = "https://snowy-wildflower-31a1.leolu55165088.workers.dev/api/parse-command"; // 請改為自己的 Worker 位址

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
  fetchPlayers();
};

const parseCommand = async () => {
  const text = nlInput.value.trim();
  if (!text) return;
  if (!isRunning.value) {
    message.warning("实例未运行，无法发送指令");
    return;
  }
  isParsing.value = true;
  try {
    const response = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, version: mcVersion.value })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    aiResult.value = data;
    if (data.success && data.commands?.length > 0) {
      confirmVisible.value = true;
    } else {
      message.error(data.error || "无法解析该指令");
    }
  } catch (err: any) {
    console.error(err);
    message.error("AI 服务连接失败");
  } finally {
    isParsing.value = false;
  }
};

const executeCommands = async () => {
  if (!aiResult.value?.commands?.length) return;
  isExecuting.value = true;
  try {
    for (let i = 0; i < aiResult.value.commands.length; i++) {
      const cmd = aiResult.value.commands[i];
      await sendCommand(cmd);
      if (i < aiResult.value.commands.length - 1) await sleep(300);
    }
    message.success("指令已执行");
  } catch (err: any) {
    message.error("指令发送失败: " + err.message);
  } finally {
    isExecuting.value = false;
    confirmVisible.value = false;
    aiResult.value = null;
    nlInput.value = "";
    showAiModal.value = false;
  }
};

const cancelExecution = () => {
  confirmVisible.value = false;
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
              <span v-if="isAdmin && instanceInfo?.watcher && instanceInfo?.watcher > 1" class="ml-16">
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
            <template v-for="item in [...quickOperations, ...instanceOperations]" :key="item.title">
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
              <a-popconfirm v-else :key="item.title" :title="t('TXT_CODE_276756b2')" @confirm="item.click">
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
        <!-- AI 按鈕已移至終端輸入框右側，此處不再放置 -->
      </div>
      <div class="status-right">
        <TerminalTags :tags="terminalTopTags" />
      </div>
    </div>

    <!-- 終端容器，加入 AI 按鈕 -->
    <div class="terminal-wrapper" style="position: relative;">
      <TerminalCore
        v-if="instanceId && daemonId"
        ref="terminalCoreRef"
        :use-terminal-hook="terminalHook"
        :instance-id="instanceId"
        :daemon-id="daemonId"
        :height="card.height"
      />
      <!-- AI 開窗按鈕，懸浮於輸入框右側 -->
      <a-button
        class="ai-float-btn"
        shape="circle"
        :disabled="!isRunning || !isConnect"
        @click="openAiModal"
      >
        <template #icon><RobotOutlined /></template>
      </a-button>
    </div>
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
      <div class="terminal-wrapper" style="position: relative;">
        <TerminalCore
          v-if="instanceId && daemonId"
          ref="terminalCoreRef"
          :use-terminal-hook="terminalHook"
          :instance-id="instanceId"
          :daemon-id="daemonId"
          :height="card.height"
        />
        <a-button
          class="ai-float-btn"
          shape="circle"
          :disabled="!isRunning || !isConnect"
          @click="openAiModal"
        >
          <template #icon><RobotOutlined /></template>
        </a-button>
      </div>
    </template>
  </CardPanel>

  <!-- AI 指令視窗 -->
  <a-modal
    v-model:open="showAiModal"
    title="自然语言转 Minecraft 指令"
    :footer="null"
    :width="620"
    destroy-on-close
  >
    <div class="ai-modal-simple">
      <div class="version-hint">
        <a-tag color="processing">Minecraft {{ mcVersion }}</a-tag>
        <span class="text-muted">AI 将根据此版本生成指令</span>
      </div>

      <a-textarea
        v-model:value="nlInput"
        placeholder="描述你想执行的操作，例如：把 Tom 传送到我身边，再给他一把钻石剑"
        :rows="3"
        :disabled="isParsing"
        allow-clear
        class="nl-textarea"
      />

      <div class="action-bar">
        <a-button
          type="primary"
          :loading="isParsing"
          :disabled="!nlInput.trim() || isParsing"
          @click="parseCommand"
        >
          <SendOutlined /> 解析指令
        </a-button>
        <!-- 按玩家管理風格重構的刷新按鈕 -->
        <a-button type="link" size="small" :loading="isLoadingPlayers" @click="fetchPlayers">
          <ReloadOutlined /> 重新整理
        </a-button>
      </div>

      <div class="player-section">
        <div class="section-title">
          <UserOutlined />
          <span>在线玩家（点击名字快速插入）</span>
        </div>
        <div v-if="onlinePlayers.length > 0" class="player-list">
          <div
            v-for="player in onlinePlayers"
            :key="player.uuid || player.name"
            class="player-item"
            @click="insertPlayerName(player.name)"
          >
            <a-avatar
              :src="`https://minotar.net/avatar/${player.name}/32`"
              :size="28"
              shape="circle"
            />
            <span class="player-name">{{ player.name }}</span>
          </div>
        </div>
        <a-empty v-else description="暂无在线玩家" :image-style="{ height: '40px' }" />
      </div>
    </div>
  </a-modal>

  <!-- 二次確認彈窗 -->
  <a-modal
    v-model:open="confirmVisible"
    title="确认执行指令"
    :confirm-loading="isExecuting"
    @ok="executeCommands"
    @cancel="cancelExecution"
    ok-text="执行"
    cancel-text="取消"
  >
    <div v-if="aiResult">
      <p><strong>解释：</strong>{{ aiResult.explanation || "无" }}</p>
      <p><strong>指令预览：</strong></p>
      <ul>
        <li v-for="cmd in aiResult.commands" :key="cmd"><code>{{ cmd }}</code></li>
      </ul>
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

/* 終端容器與 AI 浮動按鈕 */
.terminal-wrapper {
  position: relative;
  height: 100%;
}
.ai-float-btn {
  position: absolute !important;
  right: 12px;
  bottom: 12px;
  z-index: 10;
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  color: var(--color-text-secondary);
  &:hover {
    color: var(--color-primary);
  }
  &:disabled {
    color: var(--color-text-disabled);
  }
}

/* AI 窗口簡約內部佈局 */
.ai-modal-simple {
  .version-hint {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
    .text-muted {
      color: var(--color-text-secondary);
      font-size: 13px;
    }
  }
  .nl-textarea {
    margin-bottom: 16px;
  }
  .action-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }
  .player-section {
    .section-title {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--color-text-secondary);
      font-size: 13px;
      margin-bottom: 12px;
    }
    .player-list {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      .player-item {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 12px;
        border: 1px solid var(--border-color-base);
        border-radius: 6px;
        background: var(--color-bg-container);
        cursor: pointer;
        transition: all 0.2s;
        &:hover {
          border-color: var(--color-primary);
          background: var(--color-primary-bg);
        }
        .player-name {
          font-size: 14px;
          line-height: 28px;
        }
      }
    }
  }
}

.ml-16 { margin-left: 16px; }
.ml-8 { margin-left: 8px; }
.mb-10 { margin-bottom: 10px; }
.mb-6 { margin-bottom: 6px; }
.mb-24 { margin-bottom: 24px; }
.ml-12 { margin-left: 12px; }
.mr-12 { margin-right: 12px; }
</style>
