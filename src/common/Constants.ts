export const SERVER_PACKAGE = 'com.genymobile.scrcpy.Server';
export const SERVER_PORT = 8886;
// export const SERVER_VERSION = '1.19-ws6';
export const SERVER_VERSION = '3.3.2';

// export const SERVER_TYPE = 'web';
export const SERVER_TYPE = 'server_type=2';

// export const LOG_LEVEL = 'ERROR';
export const LOG_LEVEL = 'log_level=ERROR';

// let SCRCPY_LISTENS_ON_ALL_INTERFACES;
/// #if SCRCPY_LISTENS_ON_ALL_INTERFACES
// SCRCPY_LISTENS_ON_ALL_INTERFACES = true;
/// #else
// SCRCPY_LISTENS_ON_ALL_INTERFACES = false;
// SCRCPY_LISTENS_ON_ALL_INTERFACES = 'listen_on_all_interfaces=0';
/// #endif

// const ARGUMENTS = [SERVER_VERSION, SERVER_TYPE, LOG_LEVEL, SERVER_PORT, SCRCPY_LISTENS_ON_ALL_INTERFACES];

const ARGUMENTS = [
    SERVER_VERSION,
    SERVER_TYPE,
    LOG_LEVEL,
    'port_number=8886',
    'listen_on_all_interfaces=true',
    'clipboard_autosync=false',
];

export const SERVER_PROCESS_NAME = 'app_process';

export const ARGS_STRING = `/ ${SERVER_PACKAGE} ${ARGUMENTS.join(' ')} 2>&1 > /dev/null`;

// 后端服务端地址
export const SERVICE_HOST = '10.31.0.118';
export const SERVICE_PORT = 8000;
