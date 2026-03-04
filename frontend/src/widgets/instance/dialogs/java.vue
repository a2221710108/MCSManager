<script setup lang="ts">
import { useDockerEnvEditDialog, usePortEditDialog, useVolumeEditDialog } from "@/components/fc";
import { useAppRouters } from "@/hooks/useAppRouters";
import { INSTANCE_TYPE_TRANSLATION } from "@/hooks/useInstance";
import { useScreen } from "@/hooks/useScreen";
import { t } from "@/lang/i18n";
import { getNetworkModeList, imageList } from "@/services/apis/envImage";
import { updateAnyInstanceConfig } from "@/services/apis/instance";
import { dockerPortsArray } from "@/tools/common";
import { reportErrorMsg } from "@/tools/validator";
import type { DockerNetworkModes, InstanceDetail } from "@/types";
import { TERMINAL_CODE } from "@/types/const";
import { CheckOutlined, CloseOutlined, ThunderboltOutlined } from "@ant-design/icons-vue";
import type { FormInstance } from "ant-design-vue";
import { message } from "ant-design-vue";
import type { Rule } from "ant-design-vue/es/form";
import type { DefaultOptionType } from "ant-design-vue/es/select";
import { Dayjs } from "dayjs";
import _ from "lodash";
import { computed, ref, unref } from "vue";
import { GLOBAL_INSTANCE_NAME } from "../../../config/const";
import { dayjsToTimestamp, timestampToDayjs } from "../../../tools/time";

// --- Java 版本配置表 ---
const JAVA_VERSION_SCRIPTS: Record<string, string> = {
  "Java 6": "./start_6_mc.sh",
  "Java 8": "./start_8_mc.sh",
  "Java 11": "./start_11_mc.sh",
  "Java 17": "./start_17_mc.sh",
  "Java 21": "./start_21_mc.sh",
  "Custom": "" // 用於手動輸入
};

interface FormDetail extends InstanceDetail {
  dayjsEndTime?: Dayjs;
  networkAliasesText: string;
  imageSelectMethod: "SELECT" | "EDIT";
  selectedJavaVersion?: string;
}

const props = defineProps<{
  instanceInfo?: InstanceDetail;
  instanceId?: string;
  daemonId?: string;
}>();

enum TabSettings {
  Basic = "Basic",
  Docker = "Docker",
  Advanced = "Advanced",
  ResLimit = "ResLimit"
}

const emit = defineEmits(["update"]);
const { toPage } = useAppRouters();
const activeKey = ref<TabSettings>(TabSettings.Basic);
const options = ref<FormDetail>();
const screen = useScreen();
const isPhone = computed(() => screen.isPhone.value);
const open = ref(false);
const formRef = ref<FormInstance>();

const { execute: executeGetNetworkModeList } = getNetworkModeList();
const networkModes = ref<DockerNetworkModes[]>([]);
const { execute, isLoading } = updateAnyInstanceConfig();
const { execute: getImageList } = imageList();
const dockerImages = ref<{ label: string; value: string }[]>([]);

const IMAGE_DEFINE = { NEW: "__MCSM_NEW_IMAGE__", EDIT: "__MCSM_EDIT_IMAGE__" };

// 初始化表單
const initFormDetail = () => {
  if (props.instanceInfo) {
    const currentCmd = props.instanceInfo.config.startCommand;
    // 反向尋找當前指令對應的 Java 版本
    const matchedVersion = Object.keys(JAVA_VERSION_SCRIPTS).find(
      (key) => JAVA_VERSION_SCRIPTS[key] === currentCmd
    );

    options.value = {
      ...props.instanceInfo,
      dayjsEndTime: timestampToDayjs(props.instanceInfo?.config?.endTime),
      networkAliasesText: props.instanceInfo?.config?.docker.networkAliases?.join(",") || "",
      imageSelectMethod: "SELECT",
      selectedJavaVersion: matchedVersion || "Custom"
    };
  }
};

// 處理 Java 版本切換
const handleJavaVersionChange = (version: string) => {
  if (options.value && version !== "Custom") {
    options.value.config.startCommand = JAVA_VERSION_SCRIPTS[version];
  }
};

const isGlobalTerminal = computed(() => props.instanceInfo?.config.nickname === GLOBAL_INSTANCE_NAME);
const isDockerMode = computed(() => options.value?.config.processType === "docker");

const loadImages = async () => {
  dockerImages.value = [{ label: t("TXT_CODE_435f4975"), value: IMAGE_DEFINE.EDIT }];
  try {
    const images = await getImageList({ params: { daemonId: props.daemonId ?? "" }, method: "GET" });
    if (images.value) {
      for (const iterator of images.value) {
        const repoTags = iterator?.RepoTags?.[0];
        if (repoTags) dockerImages.value.push({ label: repoTags, value: repoTags });
      }
    }
  } catch (err) {}
};

const selectImage = (row: DefaultOptionType) => {
  const image = row.value;
  if (image === IMAGE_DEFINE.NEW) {
    toPage({ path: `/node/image?daemonId=${props.daemonId}` });
    return;
  }
  if (image === IMAGE_DEFINE.EDIT && options.value) {
    options.value.config.docker.image = "";
    options.value.imageSelectMethod = "EDIT";
  }
};

const loadNetworkModes = async () => {
  try {
    const modes = await executeGetNetworkModeList({ params: { daemonId: props.daemonId ?? "" } });
    if (modes.value) networkModes.value = modes.value;
  } catch (err) {}
};

const openDialog = async () => {
  open.value = true;
  initFormDetail();
  await Promise.all([loadImages(), loadNetworkModes()]);
};

const rules: Record<string, any> = {
  nickname: [{ required: true, message: t("TXT_CODE_68a504b3") }],
  startCommand: [{ required: true, message: t("請輸入啟動指令") }],
  cwd: [{ required: true, message: t("TXT_CODE_71c948a9") }]
};

const submit = async () => {
  try {
    await formRef.value?.validateFields();
    if (!options.value?.config) throw new Error("");
    const postData = _.cloneDeep(unref(options));
    if (postData) {
      postData.config.endTime = dayjsToTimestamp(postData.dayjsEndTime);
      postData.config.docker.networkAliases = postData.networkAliasesText
        .split(",")
        .map((v) => v.trim())
        .filter((v) => v !== "");
      
      await execute({
        params: { uuid: props.instanceId ?? "", daemonId: props.daemonId ?? "" },
        data: postData.config
      });
      emit("update");
      open.value = false;
      return message.success(t("TXT_CODE_d3de39b4"));
    }
  } catch (error: any) {
    return reportErrorMsg(error.message ?? t("TXT_CODE_9911ac11"));
  }
};

const handleEditDockerConfig = async (type: "port" | "volume" | "env") => {
  if (!options.value?.config) return;
  if (type === "port") {
    const portArray = dockerPortsArray(options.value.config.docker.ports || []);
    const result = await usePortEditDialog(portArray);
    options.value.config.docker.ports = result.map((v) => `${v.host}:${v.container}/${v.protocol}`);
  } else if (type === "volume") {
    const volumes = options.value.config.docker.extraVolumes?.map((v) => ({ host: v.split("|")[0], container: v.split("|")[1] }));
    const result = await useVolumeEditDialog(volumes);
    options.value.config.docker.extraVolumes = result.map((v) => `${v.host}|${v.container}`);
  } else if (type === "env") {
    const envs = options.value.config.docker.env?.map((v) => ({ label: v.split("=")[0], value: v.split("=")[1] }));
    const result = await useDockerEnvEditDialog(envs);
    options.value.config.docker.env = result.map((v) => `${v.label}=${v.value}`);
  }
};

defineExpose({ openDialog });
</script>

<template>
  <a-modal
    v-model:open="open"
    centered
    :mask-closable="false"
    :width="isPhone ? '100%' : '1200px'"
    title="Java 實例設定"
    :confirm-loading="isLoading"
    @ok="submit"
  >
    <div class="dialog-overflow-container">
      <a-tabs v-model:activeKey="activeKey">
        <a-tab-pane :key="TabSettings.Basic" :tab="t('基礎設定')"></a-tab-pane>
        <a-tab-pane :key="TabSettings.Advanced" :tab="t('進階設定')"></a-tab-pane>
        <a-tab-pane v-if="!isGlobalTerminal" :key="TabSettings.Docker" :tab="t('Docker')"></a-tab-pane>
        <a-tab-pane v-if="!isGlobalTerminal" :key="TabSettings.ResLimit" :tab="t('資源限制')"></a-tab-pane>
      </a-tabs>

      <a-form v-if="options" ref="formRef" :model="options.config" :rules="rules" layout="vertical">
        <a-row v-if="activeKey === TabSettings.Basic" :gutter="20">
          <a-col :xs="24" :lg="12">
            <a-form-item name="nickname" :label="t('實例名稱')">
              <a-input v-model:value="options.config.nickname" :disabled="isGlobalTerminal" />
            </a-form-item>
          </a-col>

          <a-col :xs="24" :lg="12">
            <a-form-item :label="t('Java 快速切換')">
              <a-select v-model:value="options.selectedJavaVersion" @change="handleJavaVersionChange">
                <a-select-option v-for="(script, version) in JAVA_VERSION_SCRIPTS" :key="version" :value="version">
                  <thunderbolt-outlined /> {{ version }} {{ script ? `(${script})` : '' }}
                </a-select-option>
              </a-select>
            </a-form-item>
          </a-col>

          <a-col :xs="24">
            <a-form-item name="startCommand" :label="t('啟動指令')">
              <a-textarea 
                v-model:value="options.config.startCommand" 
                :rows="4" 
                placeholder="./start_x_mc.sh"
              />
              <a-typography-text type="secondary">
                提示：切換上方 Java 版本會自動更新此處腳本路徑。
              </a-typography-text>
            </a-form-item>
          </a-col>
        </a-row>

        <a-row v-if="activeKey === TabSettings.Advanced" :gutter="20">
          <a-col :xs="24">
            <a-form-item name="cwd" :label="t('工作目錄')">
              <a-input v-model:value="options.config.cwd" />
            </a-form-item>
          </a-col>
        </a-row>

        <a-row v-if="activeKey === TabSettings.Docker" :gutter="20">
          <a-col :xs="24" :lg="8">
            <a-form-item :label="t('啟用 Docker')">
              <a-switch v-model:checked="options.config.processType" checked-value="docker" un-checked-value="general" />
            </a-form-item>
          </a-col>
          <template v-if="isDockerMode">
            <a-col :xs="24" :lg="16">
              <a-form-item :label="t('鏡像選擇')">
                <a-select v-model:value="options.config.docker.image" @focus="loadImages" @change="(e, opt: any) => selectImage(opt)">
                  <a-select-option v-for="item in dockerImages" :key="item.value" :value="item.value">{{ item.label }}</a-select-option>
                </a-select>
              </a-form-item>
            </a-col>
            <a-col :xs="24">
              <a-space>
                <a-button @click="handleEditDockerConfig('port')">埠號映射</a-button>
                <a-button @click="handleEditDockerConfig('volume')">掛載目錄</a-button>
                <a-button @click="handleEditDockerConfig('env')">環境變數</a-button>
              </a-space>
            </a-col>
          </template>
        </a-row>
      </a-form>
    </div>
  </a-modal>
</template>

<style scoped>
.dialog-overflow-container {
  max-height: 70vh;
  overflow-y: auto;
  padding: 10px;
}
</style>
