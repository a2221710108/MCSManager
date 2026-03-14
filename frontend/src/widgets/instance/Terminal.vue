<script setup lang="ts">
import { ref, computed } from "vue";
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
  LoadingOutlined,
  MoneyCollectOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  RedoOutlined
} from "@ant-design/icons-vue";
import { useLocalStorage } from "@vueuse/core";
import prettyBytes, { type Options as PrettyOptions } from "pretty-bytes";
import type { TagInfo } from "../../components/interface";
import { GLOBAL_INSTANCE_NAME } from "../../config/const";
import { useTerminal, type UseTerminalHook } from "../../hooks/useTerminal";
import { arrayFilter } from "../../tools/array";

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
  clearTerminal
} = terminalHook;

const instanceId = getMetaOrRouteValue("instanceId");
const daemonId = getMetaOrRouteValue("daemonId");
const viewType = getMetaOrRouteValue("viewType", false);
const innerTerminalType = computed(() => props.card.width === 12 && viewType === "inner");
const instanceTypeText = computed(
  () => INSTANCE_TYPE_TRANSLATION[instanceInfo.value?.config.type ?? -1]
);

// --- 智能日誌過濾邏輯 ---
const terminalCoreRef = ref();
const activeTab = ref("default");
const { execute: fetchFile } = fileContent();

const handleTabChange = async () => {
  if (activeTab.value === "default") {
    terminalCoreRef.value?.showDefaultView();
  } else {
    terminalCoreRef.value?.showLogView("", true);
    try {
      const res = await fetchFile({
        params: { daemonId: daemonId ?? "", uuid: instanceId ?? "" },
        data: { target: "logs/latest.log" }
      });

      const rawText = typeof res === "string" ? res : "";
      const lines = rawText.split("\n");
      const targetLevel = activeTab.value.toUpperCase();
      
      const resultLines: string[] = [];
      let isCapturing = false;

      for (const line of lines) {
        // 匹配帶有時間戳的標題行
        const isNewLogEntry = line.startsWith("[") && line.includes("]");
        
        if (isNewLogEntry) {
          if (line.includes(`/${targetLevel}]`)) {
            isCapturing = true;
            resultLines.push(line);
          } else {
            isCapturing = false;
          }
        } else if (isCapturing && line.trim() !== "") {
          // 捕獲緊隨標題行後的多行內容（報錯堆疊）
          resultLines.push(line);
        }
      }
      
      terminalCoreRef.value?.showLogView(
        resultLines.length > 0 ? resultLines.join("\n") : t("最近日誌中未發現相關資訊"), 
        false
      );
    } catch (err: any) {
      reportErrorMsg(err.message);
      terminalCoreRef.value?.showLogView(t("無法讀取日誌文件"), false);
    }
  }
};

// --- 操作按鈕 ---
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
      params: { uuid: instanceId ?? "", daemonId: daemonId ?? "" }
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
      noConfirm: true,
      type: "default",
      class: "button-color-success",
      click: toOpenInstance,
      props: {},
      condition: () => isStopped.value
    },
    {
      title: t("TXT_CODE_b1dedda3"),
      icon: PauseCircleOutlined,
      noConfirm: false,
      type: "default",
      class: "",
      click: async () => {
        try {
          await stopInstance().execute({
            params: { uuid: instanceId || "", daemonId: daemonId || "" }
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
      noConfirm: false,
      type: "default",
      class: "",
      click: async () => {
        try {
          await restartInstance().execute({
            params: { uuid: instanceId || "", daemonId: daemonId || "" }
          });
        } catch (error: any) {
          reportErrorMsg(error);
        }
      },
      props: {},
      condition: () => isRunning.value
    },
    {
      title: t("TXT_CODE_7b67813a"),
      icon: CloseOutlined,
      noConfirm: false,
      type: "danger",
      class: "color-warning",
      click: async () => {
        try {
          await killInstance().execute({
            params: { uuid: instanceId || "", daemonId: daemonId || "" }
          });
        } catch (error: any) {
          reportErrorMsg(error);
        }
      },
      props: {},
      condition: () => !isStopped.value
    },
    {
      title: t("TXT_CODE_40ca4f2"),
      type: "default",
      icon: CloudDownloadOutlined,
      noConfirm: true,
      class: "",
      click: async () => {
        try {
          clearTerminal();
          await updateInstance().execute({
            params: { uuid: instanceId || "", daemonId: daemonId || "", task_name: "update" },
            data: { time: new Date().getTime() }
          });
        } catch (error: any) {
          reportErrorMsg(error);
        }
      },
      props: {},
      condition: () => isStopped.value && updateCmd.value
    },
    {
      title: t("TXT_CODE_b19ed1dd"),
      icon: InteractionOutlined,
      noConfirm: true,
      class: "",
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
      condition: () => isStopped.value && (state.settings.allowUsePreset || isAdmin.value) && !isGlobalTerminal.value
    },
    {
      title: t("TXT_CODE_f77093c8"),
      icon: MoneyCollectOutlined,
      noConfirm: true,
      class: "",
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
  return instanceInfo.value?.config.nickname === GLOBAL_INSTANCE_NAME 
    ? t("TXT_CODE_5bdaf23d") 
    : instanceInfo.value?.config.nickname;
});

const useByteUnit = useLocalStorage("useByteUnit", true);
const prettyBytesConfig: PrettyOptions = { minimumFractionDigits: 2, maximumFractionDigits: 2, binary: true };

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
    : prettyBytes((bytes ?? 0) * 8, { ...prettyBytesConfig, bits: true, binary: false }).replace(/bit$/, "b") + "ps";

const terminalTopTags = computed<TagInfo[]>(() => {
  const info = instanceInfo.value?.info;
  if (!info || isStopped.value) return [];
  const { cpuUsage, memoryUsage, memoryLimit, memoryUsagePercent, rxBytes, txBytes } = info;
  return arrayFilter<TagInfo>([
    { label: t("TXT_CODE_b862a158"), value: `${parseInt(String(cpuUsage))}%`, color: getUsageColor(cpuUsage), icon: BlockOutlined, condition: () => cpuUsage != null },
    { label: t("TXT_CODE_593ee330"), value: formatMemoryUsage(memoryUsage, memoryLimit), color: getUsageColor(memoryUsagePercent), icon: DashboardOutlined, condition: () => memoryUsage != null },
    { label: t("TXT_CODE_50daec4"), value: `↓${formatNetworkSpeed(rxBytes)} · ↑${formatNetworkSpeed(txBytes)}`, icon: ApartmentOutlined, condition: () => rxBytes != null || txBytes != null, onClick: () => { useByteUnit.value = !useByteUnit.value; } }
  ]);
});
</script>

<template>
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
                <a-tag v-if="isRunning" color="green"><CheckCircleOutlined /> {{ instanceStatusText }}</a-tag>
                <a-tag v-else-if="isBuys" color="red"><LoadingOutlined /> {{ instanceStatusText }}</a-tag>
                <a-tag v-else-if="instanceStatusText"><InfoCircleOutlined /> {{ instanceStatusText }}</a-tag>
              </span>
              <a-tag v-if="instanceTypeText" color="purple"> {{ instanceTypeText }} </a-tag>
            </a-typography-paragraph>
          </div>
        </template>
        <template #right>
          <div v-if="!isPhone">
            <template v-for="item in [...quickOperations, ...instanceOperations]" :key="item.title">
              <a-button v-if="item.noConfirm" class="ml-8" :class="item.class" v-bind="item.props" :disabled="isOpenInstanceLoading" @click="item.click">
                <component :is="item.icon" /> {{ item.title }}
              </a-button>
              <a-popconfirm v-else :key="item.title" :title="t('TXT_CODE_276756b2')" @confirm="item.click">
                <a-button class="ml-8" :class="item.class" v-bind="item.props">
                  <component :is="item.icon" /> {{ item.title }}
                </a-button>
              </a-popconfirm>
            </template>
          </div>
        </template>
      </BetweenMenus>
    </div>

    <div class="mb-0 flex-between">
      <div class="tab-controls">
        <a-radio-group v-model:value="activeTab" size="small" @change="handleTabChange">
          <a-radio-button value="default"><DashboardOutlined /> {{ t("控制台") }}</a-radio-button>
          <a-radio-button value="warn" class="warn-tab">WARN</a-radio-button>
          <a-radio-button value="error" class="error-tab">ERROR</a-radio-button>
        </a-radio-group>
      </div>
      <div class="mb-2">
        <TerminalTags :tags="terminalTopTags" />
      </div>
    </div>

    <div class="console-section">
      <TerminalCore
        ref="terminalCoreRef"
        v-if="instanceId && daemonId"
        :use-terminal-hook="terminalHook"
        :instance-id="instanceId"
        :daemon-id="daemonId"
        :height="card.height"
      />
    </div>
  </div>

  <CardPanel v-else class="containerWrapper" style="height: 100%">
    <template #title>
      <CloudServerOutlined /> <span class="ml-8"> {{ getInstanceName }} </span>
    </template>
    <template #operator>
      <span v-for="item in quickOperations" :key="item.title" class="mr-2">
        <IconBtn :icon="item.icon" :title="item.title" @click="item.click"></IconBtn>
      </span>
      <a-dropdown>
        <template #overlay>
          <a-menu>
            <a-menu-item v-for="item in instanceOperations" :key="item.title" @click="item.click">
              <component :is="item.icon"></component><span>&nbsp;{{ item.title }}</span>
            </a-menu-item>
          </a-menu>
        </template>
        <span><IconBtn :icon="DownOutlined" :title="t('TXT_CODE_fe731dfc')"></IconBtn></span>
      </a-dropdown>
    </template>
    <template #body>
      <div class="mb-6"><TerminalTags :tags="terminalTopTags" /></div>
      <TerminalCore v-if="instanceId && daemonId" :use-terminal-hook="terminalHook" :instance-id="instanceId" :daemon-id="daemonId" :height="card.height" />
    </template>
  </CardPanel>
</template>

<style lang="scss" scoped>
.flex-between { 
  display: flex; 
  justify-content: space-between; 
  align-items: flex-end; 
  width: 100%;
}

.tab-controls {
  z-index: 2;
  :deep(.ant-radio-group) {
    display: flex;
    .ant-radio-button-wrapper {
      border-bottom: none !important;
      border-radius: 6px 6px 0 0 !important;
      background: #1e1e1e;
      color: #8c8c8c;
      border-color: var(--card-border-color);
      height: 32px;
      line-height: 30px;
      
      &.ant-radio-button-wrapper-checked {
        background: #262626;
        color: #ffffff;
        &::before { background-color: transparent !important; }
      }
      &:hover { color: #fff; }
    }
    .warn-tab.ant-radio-button-wrapper-checked {
       border-top: 2px solid #faad14 !important;
       color: #faad14 !important;
    }
    .error-tab.ant-radio-button-wrapper-checked {
       border-top: 2px solid #ff4d4f !important;
       color: #ff4d4f !important;
    }
  }
}

.console-section { 
  position: relative; 
  width: 100%;
  margin-top: -1px;
  z-index: 1;
  margin-bottom: 15px;
}

.align-center { display: flex; align-items: center; }
</style>
