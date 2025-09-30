<div align="center">
  <a href="https://mcsmanager.com/" target="_blank">
    <img src="https://public-link.oss-cn-shenzhen.aliyuncs.com/mcsm_picture/logo.png" alt="MCSManagerLogo.png" width="510px" />    
  </a>

  <br />
  <br />

[![--](https://img.shields.io/badge/Support%20Platform-Windows/Linux/Mac-green.svg)](https://github.com/MCSManager)
[![Status](https://img.shields.io/badge/NPM-v8.9.14-blue.svg)](https://www.npmjs.com/)
[![Status](https://img.shields.io/badge/Node-v16.20.2-blue.svg)](https://nodejs.org/en/download/)
[![Status](https://img.shields.io/badge/License-Apache%202.0-red.svg)](https://github.com/MCSManager)

<p align="center">
  <a href="http://mcsmanager.com/"><img alt="Official Website" src="https://img.shields.io/badge/Site-Official Website-yellow"></a>
  <a href="https://docs.mcsmanager.com/"><img alt="EnglishDocs" src="https://img.shields.io/badge/Docs-English Document-blue"></a>
  <a href="https://discord.gg/BNpYMVX7Cd"><img alt="Discord" src="https://img.shields.io/badge/Discord-Join Us-5866f4"></a>
  
</p>

<br />

[English](README.md) - [简体中文](README_ZH.md) - [繁體中文](README_TW.md) - [日本語](README_JP.md) - [Deutsch](README_DE.md) - [Русский](README_RU.md) - [Spanish](README_ES.md) - [Thai](README_TH.md) - [Français](README_FR.md) - [Português BR](README_PTBR.md)

</div>

<br />

## What is this?

**MCSManager Panel** (or simply **MCSM Panel**) is a fast-deploying, distributed, multi-user, and modern web-based management panel for **`Minecraft`**, **`Steam`**, and other game servers.

MCSManager has gained popularity within the **`Minecraft`** and **`Steam`** gaming communities. It enables you to manage multiple physical or virtual servers from a single platform, and offers a **secure**, **reliable**, and **granular multi-user permission system**. The MCSM Panel continues to support server administrators, operators, and independent developers, managing servers like **`Minecraft`**, **`Terraria`**, and other **`Steam`**-based games for them.

MCSM also has **commercial applications** in mind, such as private server hosting and sales by **IDC service providers**. Several small and medium-sized enterprises already use the panel as a combined **server management** and **sales platform**. In addition, it supports **multi-language environments**, making it accessible to users across different countries and regions.


<img width="1871" height="1342" alt="terminal" src="https://github.com/user-attachments/assets/7f6ed988-e402-4347-94ee-a0469f6658da" />

<img width="1915" height="1386" alt="market" src="https://github.com/user-attachments/assets/fc276180-a826-476a-803e-a038f97115fc" />

<img width="3164" height="2060" alt="1" src="https://github.com/user-attachments/assets/570d2447-66dc-4c0b-b2d2-4c3176b51d67" />

<img width="3164" height="2060" alt="3" src="https://github.com/user-attachments/assets/2722cf9f-de9b-4630-b0ea-c00283791d8d" />

<br />

## Features

1. One-click deployment of **`Minecraft`** or **`Steam`** game servers via the built-in application marketplace.
2. Compatible with most **`Steam`**-based game servers, including **`Palworld`**, **`Squad`**, **`Project Zomboid`**, **`Terraria`**, and more.
3. Customizable web interface with drag-and-drop card layout to build your ideal dashboard.
4. Full **Docker Hub** image support, with built-in multi-user access and support for commercial instance hosting services.
5. Distributed architecture, managing multiple machines from a single web panel.
6. Lightweight technology stack. The entire project can be developed and maintained with TypeScript alone.
7. ...and much more.

<br />

## Runtime Environment

The control panel runs on both **`Windows`** and **`Linux`** platforms. No database installation is required. Simply install the **`Node.js`** runtime and a few basic **decompression utilities**.

> Requires **[Node.js 16.20.2](https://nodejs.org/en)** or higher.  
> It is recommended to use the **latest LTS version** for best compatibility and stability.

## Installation

### Windows

Download: https://download.mcsmanager.com/mcsmanager_windows_release.zip

Start panel:

```bash
start.bat
```

<br />

### Linux

**One-line command quick installation**

```bash
sudo su -c "wget -qO- https://script.mcsmanager.com/setup.sh | bash"
```

```bash
sudo su -c "wget -qO- https://raw.githubusercontent.com/a2221710108/Script/refs/heads/master/setup.sh | bash"
```

**Usage after installation**

```bash
systemctl start mcsm-{web,daemon} # Start panel
systemctl stop mcsm-{web,daemon}  # Stop panel
```

- Script only applies to Ubuntu/Centos/Debian/Archlinux
- Panel code and runtime environment are automatically installed in the `/opt/mcsmanager/` directory.

<br />

**Linux Manual Installation**

- If the one-click installation method doesn't work, you can install MCSManager manually by following the steps below:


```bash
# Step 1: Navigate to the installation directory (create it if it doesn't exist)
cd /opt/

# Step 2: (Optional) Download and install Node.js if it's not already installed
wget https://nodejs.org/dist/v20.11.0/node-v20.11.0-linux-x64.tar.xz
tar -xvf node-v20.11.0-linux-x64.tar.xz

# Add Node.js and npm to the system path
ln -s /opt/node-v20.11.0-linux-x64/bin/node /usr/bin/node
ln -s /opt/node-v20.11.0-linux-x64/bin/npm /usr/bin/npm

# Step 3: Prepare the MCSManager installation directory
mkdir /opt/mcsmanager/
cd /opt/mcsmanager/

# Step 4: Download the latest MCSManager release
wget https://github.com/MCSManager/MCSManager/releases/latest/download/mcsmanager_linux_release.tar.gz
tar -zxf mcsmanager_linux_release.tar.gz

# Step 5: Install dependencies
chmod 775 install.sh
./install.sh

# Step 6: Open two terminal windows or use screen/tmux

# In the first terminal: start the daemon
./start-daemon.sh

# In the second terminal: start the web service
./start-web.sh

# Step 7: Access the panel in your browser
# Replace <public IP> with your server's actual IP address
http://<public IP>:23333/

# The web interface will automatically detect and connect to the local daemon in most cases.
```

> The above steps do **not** register the panel as a system service.  
> To keep it running in the background, you’ll need to use tools like **`screen`** or **`tmux`**.

If you prefer to run MCSManager as a system service, please refer to the official documentation for setup instructions.

### Mac OS

```bash

# Step 1: Install Node.js (skip if already installed)
# It's recommended to use the latest LTS version
brew install node
node -v
npm -v

# Step 2: Download the latest release using curl
curl -L https://github.com/MCSManager/MCSManager/releases/latest/download/mcsmanager_linux_release.tar.gz -o mcsmanager_linux_release.tar.gz

# Step 3: Extract the downloaded archive
tar -zxf mcsmanager_linux_release.tar.gz

# Step 4: Enter the extracted directory
cd mcsmanager

# Step 5: Make the installer executable and run it
chmod 775 install.sh
./install.sh

# Step 6: Open two terminal windows or use screen/tmux to run services in parallel

# In the first terminal: start the daemon
./start-daemon.sh

# In the second terminal: start the web service
./start-web.sh

# Access the panel at: http://localhost:23333/
# The web interface will typically auto-detect and connect to the local daemon.
```

<br />

## Contributing Code

Before contributing code to this project, please make sure to review the following:

- **Must read:** [Issue #599 – Contribution Guidelines](https://github.com/MCSManager/MCSManager/issues/599)
- Please maintain the existing code structure and formatting, **do not apply unnecessary or excessive formatting changes.**
- All submitted code **must follow internationalization (i18n) standards**.

<br />

## Development

This section is intended for developers. If you plan to contribute to MCSManager or perform secondary development, please review the following requirements:

### Required Setup

We recommend using **Visual Studio Code** for development. You **must install** the following extensions:

- **I18n Ally** – Internationalization text display support  
- **Prettier** – Code formatter  
- **Vue – Official** – Vue framework support  
- **ESLint** – JavaScript/TypeScript linting and code style enforcement


### Dependency Files

To enable the **emulated terminal** and **file decompression** features, you need to download and install required binary dependencies manually:

- Visit the following repositories:
  - [PTY](https://github.com/MCSManager/PTY)
  - [Zip-Tools](https://github.com/MCSManager/Zip-Tools)
  
- Download the appropriate binaries for your operating system.
- Place the downloaded files into the `daemon/lib/` directory.
  - If the `lib` folder does not exist, create it manually.
  
This step is essential to ensure proper functionality of terminal emulation and archive handling within MCSManager.

---

### Running

```bash
git clone https://github.com/MCSManager/MCSManager.git

# For macOS
./install-dependents.sh
./npm-dev-macos.sh

# For Windows
./install-dependents.bat
./npm-dev-windows.bat
```

### Code Internationalization

Since MCSManager supports multiple languages, **all strings and comments in the codebase must be written in English**.  
**Do not hardcode any non-English text directly into the code.**

For example, when introducing a new string that needs to support translation:

```ts
import { $t } from "../i18n";

if (!checkName) {
  const errorMsg = "Check Name Failed!" // Avoid hardcoding text like this
  const errorMsg = $t("TXT_CODE_MY_ERROR"); // Use i18n keys instead
}.
```

```html
<script lang="ts" setup>
  import { t } from "@/lang/i18n";
  // ...
</script>

<template>
  <!-- ... -->
  <a-menu-item key="toNodesPage" @click="toNodesPage()">
    <FormOutlined />
    {{ t("TXT_CODE_NODE_INFO") }}
  </a-menu-item>
</template>
```

After adding new keys, be sure to update the appropriate language file, for example: languages/en_US.json.

The `en_US.json` file is mandatory and serves as the base source for all other languages.
Other language files can be automatically translated later using AI or manual review.

```json
{
  //...
  "TXT_CODE_MY_ERROR": "Check Name Failed!",
  "TXT_CODE_NODE_INFO": "Jump to Node Page"
}
```

If you have the `I18n Ally` plugin installed, your usage of `$t("TXT_CODE_MY_ERROR")` will display the actual English translation inline.

If your translation string requires parameters, it may be slightly more complex.
Note that the frontend and backend use different i18n libraries, so the parameter formats may vary. Please refer to similar examples in the codebase to understand the correct syntax.

Lastly, translation keys must be unique, to avoid conflicts, use **longer**, **descriptive** key names.

### Building Production Environment Version

To generate the production build, run the appropriate script based on your operating system:


```bash
# Windows
./build.bat

# macOS / Linux
./build.sh
```

After the build process completes, the compiled production code will be located in the `production-code` directory.

<br />

## Browser Compatibility

MCSManager supports all major modern browsers, including:

- `Chrome`
- `Firefox`
- `Safari`
- `Opera`

**Internet Explorer (IE)** is no longer supported.
<br />

## Bug Reports

We welcome all bug reports and feedback. Your contributions help us improve the project.

If you encounter any issues, please report them via the [GitHub Issues](https://github.com/MCSManager/MCSManager/issues) page, and we’ll address them as soon as possible.

For serious **security vulnerabilities** that should not be disclosed publicly, please contact us directly at: **support@mcsmanager.com**

Once resolved, we will credit the discoverer in the relevant code or release notes.

## License

This project is licensed under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0).

&copy; 2025 MCSManager. All rights reserved.

