<script setup lang="ts">
import { ref, computed, nextTick } from "vue";
import CardPanel from "@/components/CardPanel.vue";
import { openMarketDialog, openRenewalDialog } from "@/components/fc";
import IconBtn from "@/components/IconBtn.vue";
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
} from "@ant-design/icons-vue";
import { useLocalStorage } from "@vueuse/core";
import prettyBytes, { type Options as PrettyOptions } from "pretty-bytes";
import type { TagInfo } from "../../components/interface";
import { GLOBAL_INSTANCE_NAME } from "../../config/const";
import { useTerminal, type UseTerminalHook } from "../../hooks/useTerminal";
import { arrayFilter } from "../../tools/array";
import { message, Modal } from "ant-design-vue";

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
  sendCommand,      // 终端发送指令的方法
  isConnect         // 终端连接状态
} = terminalHook;

const instanceId = getMetaOrRouteValue("instanceId");
const daemonId = getMetaOrRouteValue("daemonId");
const viewType = getMetaOrRouteValue("viewType", false);
const innerTerminalType = computed(() => props.card.width === 12 && viewType === "inner");
const instanceTypeText = computed(
  () => INSTANCE_TYPE_TRANSLATION[instanceInfo.value?.config.type ?? -1]
);

// --- 日志过滤功能（保留原有）---
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

// --- 原有的实例操作逻辑（保持不变）---
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

// ===================== AI 指令转换窗口 =====================
const showAiModal = ref(false);           // 是否显示 AI 窗口
const nlInput = ref("");                  // 自然语言输入
const isParsing = ref(false);
const isExecuting = ref(false);
const confirmVisible = ref(false);
const aiResult = ref<{ success: boolean; commands: string[]; explanation: string; error?: string } | null>(null);

// 玩家列表相关
const onlinePlayers = ref<any[]>([]);
const isLoadingPlayers = ref(false);

// Worker URL（替换为你的实际地址）
const WORKER_URL = "https://snowy-wildflower-31a1.leolu55165088.workers.dev/api/parse-command";

// 获取 ping 地址
const pingConfig = computed(() => ({
  ip: instanceInfo.value?.config?.pingConfig?.ip || "",
  port: instanceInfo.value?.config?.pingConfig?.port || 25565
}));

// 获取 MC 版本（直接从 instanceInfo 中取）
const mcVersion = computed(() => {
  return instanceInfo.value?.info?.version || "未知";
});

// 获取在线玩家
const fetchPlayers = async () => {
  if (!pingConfig.value.ip) {
    message.warning("未配置服务器 IP，无法获取玩家列表");
    return;
  }
  isLoadingPlayers.value = true;
  try {
    const res = await fetch(
      `https://api.mcstatus.io/v2/status/java/${pingConfig.value.ip}:${pingConfig.value.port}?t=${Date.now()}`
    );
    const data = await res.json();
    if (data.online && data.players?.list) {
      onlinePlayers.value = data.players.list.map((p: any) => p.name_raw || p.name);
    } else {
      onlinePlayers.value = [];
      if (data.online) message.info("服务器在线，但未公开玩家名单");
      else message.warning("服务器离线，无法获取玩家列表");
    }
  } catch (err) {
    console.error("获取玩家失败:", err);
    message.error("获取玩家列表失败");
  } finally {
    isLoadingPlayers.value = false;
  }
};

// 打开 AI 窗口时自动获取玩家列表
const openAiModal = () => {
  showAiModal.value = true;
  nlInput.value = "";
  fetchPlayers();
};

// 点击玩家名快速插入到输入框中
const insertPlayerName = (name: string) => {
  nlInput.value += ` ${name} `;
  // 焦点回到输入框（通过 ref 的方式后续可优化）
};

// 解析自然语言
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
      body: JSON.stringify({ text })
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    aiResult.value = data;

    if (data.success && data.commands?.length > 0) {
      confirmVisible.value = true;   // 弹出二次确认
    } else {
      message.error(data.error || "无法解析该指令");
    }
  } catch (err: any) {
    console.error(err);
    message.error("AI 服务连接失败，请稍后重试");
  } finally {
    isParsing.value = false;
  }
};

// 执行指令
const executeCommands = async () => {
  if (!aiResult.value?.commands?.length) return;
  isExecuting.value = true;
  try {
    for (let i = 0; i < aiResult.value.commands.length; i++) {
      const cmd = aiResult.value.commands[i];
      // 使用终端的 sendCommand 方法发送
      await sendCommand(cmd);
      if (i < aiResult.value.commands.length - 1) {
        await sleep(300);
      }
    }
    message.success(`成功执行 ${aiResult.value.commands.length} 条指令`);
  } catch (err: any) {
    message.error("指令发送失败: " + err.message);
  } finally {
    isExecuting.value = false;
    confirmVisible.value = false;
    showAiModal.value = false;   // 执行后关闭 AI 窗口（可选）
  }
};

const cancelExecution = () => {
  confirmVisible.value = false;
};
</script>

<template>
  <!-- 内部终端样式（inner） -->
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
        <!-- 新增 AI 指令按钮 -->
        <a-button
          class="ml-12"
          type="default"
          @click="openAiModal"
          :disabled="!isRunning"
          :icon="h(RobotOutlined)"
        >
          AI 指令
        </a-button>
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
    />
  </div>

  <!-- 外部卡片样式（非 inner） -->
  <CardPanel v-else class="containerWrapper" style="height: 100%">
    <template #title>
      <CloudServerOutlined />
      <span class="ml-8"> {{ getInstanceName }} </span>
    </template>

    <template #operator>
    </template>

    <template #body>
      <div class="mb-6 status-bar-flex">
        <div class="status-left">
          <a-radio-group v-model:value="activeTab" size="small" @change="handleTabChange">
            <a-radio-button value="default">{{ t("控制台") }}</a-radio-button>
            <a-radio-button value="warn">WARN</a-radio-button>
            <a-radio-button value="error">ERROR</a-radio-button>
          </a-radio-group>
          <a-button
            class="ml-12"
            type="default"
            @click="openAiModal"
            :disabled="!isRunning"
            :icon="h(RobotOutlined)"
          >
            AI 指令
          </a-button>
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
      />
    </template>
  </CardPanel>

  <!-- AI 指令窗口 -->
  <a-modal
    v-model:open="showAiModal"
    title="自然语言转 Minecraft 指令"
    width="700px"
    :footer="null"
    destroy-on-close
  >
    <div class="ai-command-modal">
      <!-- 版本信息 -->
      <a-alert
        class="mb-12"
        type="info"
        show-icon
      >
        <template #message>
          Minecraft 版本：{{ mcVersion }}
        </template>
      </a-alert>

      <!-- 输入区 -->
      <div class="input-area">
        <a-textarea
          v-model:value="nlInput"
          placeholder="描述你的操作，例如：把玩家 Tom 传送到我身边，再给他一个钻石剑"
          :rows="3"
          :disabled="isParsing"
        />
        <a-button
          class="ml-8"
          type="primary"
          :loading="isParsing"
          :disabled="!nlInput.trim() || isParsing"
          @click="parseCommand"
        >
          <SendOutlined /> 解析指令
        </a-button>
      </div>

      <!-- 在线玩家快速选择 -->
      <a-collapse class="mt-16" :bordered="false">
        <a-collapse-panel key="1" header="🎮 在线玩家（点击快速插入名称）">
          <template #extra>
            <a-button size="small" :loading="isLoadingPlayers" @click.stop="fetchPlayers">
              刷新
            </a-button>
          </template>
          <div v-if="onlinePlayers.length > 0" class="player-chips">
            <a-tag
              v-for="player in onlinePlayers"
              :key="player"
              color="blue"
              class="player-chip"
              @click="insertPlayerName(player)"
            >
              <UserOutlined /> {{ player }}
            </a-tag>
          </div>
          <a-empty v-else description="暂无在线玩家或获取失败" />
        </a-collapse-panel>
      </a-collapse>
    </div>
  </a-modal>

  <!-- 二次确认弹窗 -->
  <a-modal
    v-model:open="confirmVisible"
    title="确认执行指令"
    :confirm-loading="isExecuting"
    @ok="executeCommands"
    @cancel="cancelExecution"
    ok-text="执行"
    cancel-text="取消"
  >
    <template v-if="aiResult">
      <p><strong>解释：</strong>{{ aiResult.explanation || "无额外说明" }}</p>
      <p><strong>将要执行的指令：</strong></p>
      <ul>
        <li v-for="cmd in aiResult.commands" :key="cmd"><code>{{ cmd }}</code></li>
      </ul>
    </template>
  </a-modal>
</template>

<style lang="scss" scoped>
/* 原有样式保留 */
.error-card { ... }
.status-bar-flex { ... }
// ...其余原有样式

/* AI 指令窗口样式 */
.ai-command-modal {
  .input-area {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    .ant-btn {
      flex-shrink: 0;
    }
  }
  .player-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    .player-chip {
      cursor: pointer;
      transition: all 0.2s;
      &:hover {
        transform: scale(1.05);
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      }
    }
  }
  .mt-16 { margin-top: 16px; }
  .mb-12 { margin-bottom: 12px; }
  .ml-8 { margin-left: 8px; }
}
.ml-12 { margin-left: 12px; }
</style>
