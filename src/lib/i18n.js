// One language for the whole app: the assistant replies in it, and the interface
// speaks it when a dictionary ships. Hinglish is the default because the app was
// built by an Indian for Indian users.
//
// Keys live in three dictionaries (English is the fallback for anything missing).
// The assistant's reply language is NOT limited to those three — it works for any
// language the model can speak, because the model does the translating.
//
// This module is free of imports so tests and the main process can use it.

export const ENGLISH = {
  // header
  header_chats: 'Chats',
  header_show_chats: 'Show chats',
  header_hide_chats: 'Hide chats',
  header_new_chat: 'New chat',
  header_settings: 'Settings',
  header_settings_aria: 'Providers and settings',
  header_streaming: 'streaming',
  setup_ready: 'ready',
  err_key_rejected: 'The key was rejected. Check it in settings, or pick another provider.',
  err_model_not_found: 'That model or address was not found. Check the model name.',
  err_rate_limited: 'Rate limited by the provider. Wait a moment, or switch models.',
  err_out_of_credit: 'That account is out of credit.',
  err_rejected_request: 'The provider rejected the request. Check the model name in settings.',
  err_provider_down: 'The provider is having trouble. Try again shortly.',
  err_request_failed: 'The request failed.',
  prov_custom_base_url: 'Add a base URL for this provider in settings.',
  prov_custom_model_name: 'Add a model name for this provider in settings.',
  prov_custom_model_list: 'That address did not return a model list. Type the model name instead.',
  prov_gemini_models: 'Gemini returned an unexpected list of models.',
  prov_ollama_answer: 'Ollama answered with something unexpected. Check the host address.',
  prov_omniroute_models: 'OmniRoute returned an unexpected list of models.',
  prov_openrouter_models: 'OpenRouter returned an unexpected list of models.',
  prov_gemini_blocked: 'Gemini blocked this answer with a safety filter.',
  // theme
  theme_light: 'Light',
  theme_dark: 'Dark',
  theme_switch_light: 'Switch to light theme',
  theme_switch_dark: 'Switch to dark theme',
  // sidebar
  sidebar_chats: 'Chats',
  sidebar_new: 'New chat',
  sidebar_empty: 'No chats yet. The first message starts one.',
  sidebar_rename_aria: 'Rename {title}',
  sidebar_delete_aria: 'Delete {title}',
  sidebar_delete: 'Delete',
  sidebar_name_aria: 'Chat name',
  sidebar_conversations_aria: 'Conversations',
  // composer
  composer_label: 'Message',
  composer_placeholder_model: 'Ask it anything, or "play lofi on youtube"',
  composer_placeholder_no_model: 'Pick a model first, or "play lofi on youtube"',
  composer_change_model: 'Change model',
  composer_no_model: 'no model',
  composer_stop: 'Stop',
  composer_stop_aria: 'Stop generating',
  composer_send: 'Send',
  composer_send_aria: 'Send message',
  // empty state
  empty_svg_label: 'An iceberg, most of it under the water',
  empty_hero_1: 'Most of it',
  empty_hero_2: 'is under the surface.',
  empty_status_local_zero: 'Ollama is running. No model downloaded yet.',
  empty_status_local_one: 'Ollama is running. 1 model ready.',
  empty_status_local_many: 'Ollama is running. {n} models ready.',
  empty_status_ready_cloud: '{label} is ready on {model}.',
  empty_status_down: "Ollama isn't running. Start it, or pick another provider.",
  empty_status_none: 'No provider is set up yet. Add one, and it stays on this machine.',
  empty_start: 'Start chatting',
  empty_add_provider: 'Add a provider',
  empty_pick_model: 'Pick a model',
  empty_first_question: 'Ask a first question',
  empty_first_question_text: 'Explain what a race condition is, with a small example.',
  empty_meta_ready: 'One message is two metres. The gauge on the left keeps count.',
  empty_meta_keys: 'Keys are encrypted on this machine and only used for the requests you send.',
  // chat view
  chat_conversation_aria: 'Conversation',
  // message
  msg_computer_task: 'Computer task',
  msg_opening: 'Opening…',
  msg_open: 'Open',
  msg_cancel: 'Cancel',
  msg_listening: 'Listening for the answer',
  msg_stopped_before: 'Stopped before the answer started.',
  msg_stopped: 'Stopped',
  msg_copied: 'Copied',
  msg_copy: 'Copy',
  msg_copy_aria: 'Copy answer',
  msg_copied_aria: 'Answer copied',
  // modal + toasts + code
  modal_close: 'Close',
  toast_dismiss: 'Dismiss',
  code_copied: 'Copied',
  code_copy: 'Copy',
  code_failed: 'Copy failed',
  code_copy_aria: 'Copy code',
  // model menu
  menu_choose_aria: 'Choose a provider and model',
  menu_providers: 'Providers',
  menu_setup: 'setup',
  menu_provider_setup: 'Provider setup',
  menu_finish_setup: 'Finish setup for {label}',
  menu_models: 'Models',
  menu_loading: 'Looking for models…',
  menu_no_models: 'No models found on this provider yet.',
  menu_start_service: 'Start the service in a terminal, then open this menu again.',
  menu_no_models_yet: 'no model yet',
  menu_models_aria: 'Models',
  // model pull
  pull_title: 'Pull a model',
  pull_using: 'using {model}',
  pull_aria: 'Model to pull',
  pull_button: 'Pull',
  pull_stop: 'Stop',
  pull_ready: 'Ready',
  pull_cancelled: 'Cancelled',
  pull_aria_pulling: 'Pulling {model}',
  pull_ready_toast: '{model} is ready on Ollama.',
  pull_stopped: 'The download was stopped.',
  pull_try_again: 'Try again',
  pull_installed: 'The model is installed on this machine.',
  pull_done: 'Done',
  // ollama installer
  oli_installed_not_running_title: 'Ollama is installed, but not running',
  oli_installed_not_running_desc: 'IceBurg found Ollama on this machine but nothing is answering on port 11434.',
  oli_not_running_body: 'Open the Ollama app, or run `ollama serve` in a terminal, then check again.',
  oli_check_again: 'Check again',
  oli_use_cloud: 'Use a cloud provider',
  oli_still_nothing: 'Still nothing on port 11434. Give it a few seconds, then check again.',
  oli_ask_title: "Ollama isn't installed",
  oli_ask_desc: 'Ollama runs models on this computer, privately and without a key.',
  oli_ask_body: 'Install it now and IceBurg will find it automatically. You can also keep going with a cloud provider instead.',
  oli_install: 'Install Ollama',
  oli_not_now: 'Not now',
  oli_ask_note: 'Uses the official installer from ollama.com. Windows and macOS open it; Linux runs the official script in your terminal.',
  oli_installing: 'Installing Ollama',
  oli_working: 'Working…',
  oli_still_waiting: 'Still waiting on the installer. Check the app it opened.',
  oli_installed_body: 'When the installer finishes, come back here and check again. Ollama may need to be started once.',
  oli_close: 'Close',
  oli_failed_title: 'Ollama was not installed',
  oli_try_again: 'Try again',
  oli_open_install: 'Open the install page',
  oli_finish_installer: 'Finish the installer, then check again here.',
  oli_script_running: 'The official script is running in your terminal. Watch it for the sudo prompt.',
  oli_nothing_yet: 'Nothing is answering on port 11434 yet. Start Ollama, then check again.',
  oli_did_not_start: 'The install did not start.',
  oli_opening: 'Opening the official installer…',
  oli_could_not_open: 'The installer could not be opened.',
  // settings dialog
  set_title: 'Providers and models',
  set_desc: 'Keys are stored on this machine, encrypted, and only used for the requests you send.',
  set_providers_aria: 'Providers',
  set_appearance: 'Appearance',
  set_keys_keychain: 'Keys encrypted with the system keychain ({platform}).',
  set_keys_no_keyring: 'This system has no keyring, so keys are obfuscated, not encrypted.',
  set_keys_checking: 'Checking how keys can be stored…',
  set_in_use: 'In use',
  set_use_provider: 'Use this provider',
  set_ollama_not_running: 'Ollama is installed but not running. Start it, or install it again below.',
  set_ollama_not_installed: "Ollama isn't installed. It runs models on this machine, with no key.",
  set_how_start: 'How to start it',
  set_install_ollama: 'Install Ollama',
  set_ollama_running: 'Ollama is running and answering on this machine.',
  set_installed_models: 'Installed models',
  set_choose_one: 'Choose one of {n}',
  set_name: 'Name',
  set_host: 'Host',
  set_base_url: 'Base URL',
  set_base_url_note: 'Leave this unless Ollama runs on another port or machine.',
  set_api_key: 'API key',
  set_where_key: 'Where do I get one?',
  set_key_saved_on_machine: 'Key saved on this machine',
  set_key_remove: 'Remove',
  set_key_replace: 'Replace',
  set_paste_key: 'Paste the key',
  set_save_key: 'Save key',
  set_key_optional: 'Optional: leave empty if the router does not require one.',
  set_saved_flash: 'Saved.',
  set_model_name: 'Model name',
  set_model_placeholder: 'the model id your server expects',
  set_model_note: 'Ask the server with a test below; if it lists models, pick one from the switcher instead.',
  set_model: 'Model',
  set_model_menu_placeholder: 'Pick one from the model menu, or type a name',
  set_test_connection: 'Test connection',
  set_testing: 'Testing…',
  set_connected_none: 'Connected, but no models are available yet.',
  set_connected_one: 'Connected. 1 model available.',
  set_connected_some: 'Connected. {n} models available.',
  set_one_model: '1 model',
  set_models: '{n} models',
  set_key_saved_toast: 'Key saved for {name}.',
  set_key_removed_toast: 'Key removed for {name}.',
  // language section
  set_language_section: 'Language',
  set_language_label: 'App and reply language',
  set_language_caption: 'The assistant always replies in this language, whatever language you write in. App text ships in Hinglish, English and Hindi — any other language keeps an English interface.',
  set_language_other_placeholder: 'e.g. Tamil, Bengali, Urdu…',
  set_language_other_aria: 'Language name',
  set_language_other_note: 'App text falls back to English for this language. The assistant replies in it.',
  language_hinglish: 'Hinglish',
  language_english: 'English',
  language_hindi: 'हिन्दी (Hindi)',
  language_other: 'Other…',
  // errors (store)
  err_pick_model: 'Pick a model first. Open the switcher above the composer.',
  err_empty_answer: 'The model returned an empty answer. Try again, or switch models.',
  err_nothing_running: 'Nothing answered at that address. Start the service, or switch provider.',
  err_offline: "Can't reach the network. Check your connection.",
  err_timeout: 'No answer in time. The model may be loading; try again.',
  err_something: 'Something went wrong. Try again.',
  err_stopped: 'Stopped.',
  // app shell
  app_opening: 'Opening…',
}

export const HINGLISH = {
  ...ENGLISH,
  // header
  header_chats: 'Chats',
  header_show_chats: 'Chats dikhayein',
  header_hide_chats: 'Chats chhupaayein',
  header_new_chat: 'Nayi chat',
  header_settings: 'Settings',
  header_settings_aria: 'Providers aur settings',
  header_streaming: 'streaming',
  // theme
  theme_light: 'Light',
  theme_dark: 'Dark',
  theme_switch_light: 'Light theme pe switch karein',
  theme_switch_dark: 'Dark theme pe switch karein',
  // sidebar
  sidebar_chats: 'Chats',
  sidebar_new: 'Nayi chat',
  sidebar_empty: 'Abhi koi chat nahi hai. Pehla message bhejte hi chat ban jayegi.',
  sidebar_rename_aria: '{title} ka naam badlein',
  sidebar_delete_aria: '{title} delete karein',
  sidebar_delete: 'Delete',
  sidebar_name_aria: 'Chat ka naam',
  sidebar_conversations_aria: 'Conversations',
  // composer
  composer_label: 'Message',
  composer_placeholder_model: 'Kuch bhi puchhiye, ya "play lofi on youtube"',
  composer_placeholder_no_model: 'Pehle model choose karein, ya "play lofi on youtube"',
  composer_change_model: 'Model badlein',
  composer_no_model: 'koi model nahi',
  composer_stop: 'Rok do',
  composer_stop_aria: 'Generating rokein',
  composer_send: 'Bhejo',
  composer_send_aria: 'Message bhejein',
  // empty state
  empty_svg_label: 'Ek iceberg, zyaadatar paani ke andar',
  empty_hero_1: 'Zyaadatar hissa',
  empty_hero_2: 'surface ke neeche hai.',
  empty_status_local_zero: 'Ollama chal raha hai. Abhi koi model download nahi hai.',
  empty_status_local_one: 'Ollama chal raha hai. 1 model ready hai.',
  empty_status_local_many: 'Ollama chal raha hai. {n} models ready hain.',
  empty_status_ready_cloud: '{label}, {model} pe ready hai.',
  empty_status_down: "Ollama nahi chal raha. Shuru karein, ya doosra provider choose karein.",
  empty_status_none: 'Abhi koi provider set nahi hai. Ek add karein, aur wo is machine pe hi rahega.',
  empty_start: 'Chat shuru karein',
  empty_add_provider: 'Provider add karein',
  empty_pick_model: 'Model choose karein',
  empty_first_question: 'Pehla sawaal puchhiye',
  empty_first_question_text: 'Explain what a race condition is, with a small example.',
  empty_meta_ready: 'Ek message do metre. Left mein gauge count rakhta hai.',
  empty_meta_keys: 'Keys is machine pe encrypted rehti hain — sirf aapke requests ke liye use hoti hain.',
  // message
  msg_computer_task: 'Computer task',
  msg_opening: 'Khul raha hai…',
  msg_open: 'Khol do',
  msg_cancel: 'Cancel',
  msg_listening: 'Jawab ka intezaar hai',
  msg_stopped_before: 'Jawab shuru hone se pehle rok diya.',
  msg_stopped: 'Rok diya',
  msg_copied: 'Copied',
  msg_copy: 'Copy',
  msg_copy_aria: 'Jawab copy karein',
  msg_copied_aria: 'Jawab copied',
  // modal + toasts + code
  code_copied: 'Copied',
  code_copy: 'Copy',
  code_failed: 'Copy nahi hua',
  // model menu
  menu_choose_aria: 'Provider aur model choose karein',
  menu_providers: 'Providers',
  menu_provider_setup: 'Provider setup',
  menu_finish_setup: '{label} ka setup complete karein',
  menu_models: 'Models',
  menu_loading: 'Models dhoond rahe hain…',
  menu_no_models: 'Is provider pe abhi koi model nahi mila.',
  menu_start_service: 'Terminal mein service shuru karein, phir yeh menu dobara kholein.',
  menu_no_models_yet: 'abhi koi model nahi',
  // model pull
  pull_title: 'Model pull karein',
  pull_using: '{model} use ho raha hai',
  pull_aria: 'Kaun sa model pull karein',
  pull_button: 'Pull',
  pull_stop: 'Rok do',
  pull_ready: 'Ready',
  pull_cancelled: 'Cancelled',
  pull_aria_pulling: '{model} pull ho raha hai',
  pull_ready_toast: '{model} Ollama pe ready hai.',
  pull_stopped: 'Download rok diya gaya.',
  pull_try_again: 'Dobara try karein',
  pull_installed: 'Model is machine pe install ho gaya.',
  pull_done: 'Done',
  // ollama installer
  oli_installed_not_running_title: 'Ollama install hai, par nahi chal raha',
  oli_installed_not_running_desc: 'IceBurg ko is machine pe Ollama mila, par port 11434 pe kuch nahi jawab de raha.',
  oli_not_running_body: 'Ollama app kholein, ya terminal mein `ollama serve` chalayein, phir dobara check karein.',
  oli_check_again: 'Dobara check karein',
  oli_use_cloud: 'Cloud provider use karein',
  oli_still_nothing: 'Port 11434 pe abhi bhi kuch nahi hai. Thoda intezaar karein, phir check karein.',
  oli_ask_title: "Ollama install nahi hai",
  oli_ask_desc: 'Ollama is computer pe models chalata hai — private, aur bina key ke.',
  oli_ask_body: 'Abhi install karein, IceBurg khud dhoond lega. Churrain toh cloud provider ke saath chalu reh sakte hain.',
  oli_install: 'Ollama install karein',
  oli_not_now: 'Abhi nahi',
  oli_ask_note: 'Official installer ollama.com se aata hai. Windows aur macOS pe installer khulta hai; Linux pe terminal mein script chalti hai.',
  oli_installing: 'Ollama install ho raha hai',
  oli_working: 'Kaam chal raha hai…',
  oli_still_waiting: 'Installer ka intezaar hai. Koi app khul gayi hogi — usse check karein.',
  oli_installed_body: 'Installer khatam hone ke baad wapas aakar check karein. Ollama ko ek baar start karna pad sakta hai.',
  oli_close: 'Close',
  oli_failed_title: 'Ollama install nahi hua',
  oli_open_install: 'Install page kholein',
  oli_finish_installer: 'Installer pura hone dein, phir yahan wapas check karein.',
  oli_script_running: 'Official script aapke terminal mein chal rahi hai. Sudo prompt dikhe toh dekhte rahein.',
  oli_nothing_yet: 'Port 11434 pe abhi kuch jawab nahi de raha. Ollama start karein, phir check karein.',
  oli_did_not_start: 'Install shuru nahi hua.',
  oli_opening: 'Official installer khul raha hai…',
  oli_could_not_open: 'Installer khul nahi paaya.',
  // settings dialog
  set_appearance: 'Appearance',
  set_keys_keychain: 'Keys system keychain mein encrypted hain ({platform}).',
  set_keys_no_keyring: 'Is system mein koi keyring nahi hai, isliye keys obfuscated hain, encrypted nahi.',
  set_keys_checking: 'Dekh rahe hain ki keys kaise store hongi…',
  set_in_use: 'In use',
  set_use_provider: 'Ye provider use karein',
  set_ollama_not_running: 'Ollama install hai par nahi chal raha. Start karein, ya neeche se phir install karein.',
  set_ollama_not_installed: "Ollama install nahi hai. Ye is machine pe models chalata hai, bina key ke.",
  set_how_start: 'Start kaise karein',
  set_ollama_running: 'Ollama chal raha hai aur is machine pe jawab de raha hai.',
  set_installed_models: 'Installed models',
  set_choose_one: '{n} mein se ek choose karein',
  set_base_url_note: 'Jab tak Ollama doosre port ya machine pe na ho, ise mat badlein.',
  set_api_key: 'API key',
  set_where_key: 'Ye kahan se milegi?',
  set_key_saved_on_machine: 'Key is machine pe saved hai',
  set_key_remove: 'Remove',
  set_key_replace: 'Replace',
  set_paste_key: 'Key paste karein',
  set_save_key: 'Key save karein',
  set_key_optional: 'Optional: agar router ko key nahi chahiye toh khaali chhod dein.',
  set_saved_flash: 'Saved.',
  set_model_name: 'Model ka naam',
  set_model_placeholder: 'wo model id jo aapka server expect karta hai',
  set_model_note: 'Neeche test se server se poochhiye; models list aaye toh switcher se choose karein.',
  set_model: 'Model',
  set_model_menu_placeholder: 'Model menu se choose karein, ya naam type karein',
  set_test_connection: 'Connection test karein',
  set_testing: 'Test ho raha hai…',
  set_connected_none: 'Connected hai, par abhi koi model available nahi hai.',
  set_connected_one: 'Connected. 1 model available hai.',
  set_connected_some: 'Connected. {n} models available hain.',
  set_one_model: '1 model',
  set_models: '{n} models',
  set_key_saved_toast: '{name} ke liye key save ho gayi.',
  set_key_removed_toast: '{name} ki key remove ho gayi.',
  // language section
  set_language_section: 'Bhasha',
  set_language_label: 'App aur jawab ki bhasha',
  set_language_caption: 'Assistant hamesha isi bhasha mein jawab dega, chahe aap kisi bhi bhasha mein likhein. App text Hinglish, English aur Hindi mein milta hai — kisi aur bhasha ke liye interface English rahega.',
  set_language_other_placeholder: 'jaise Tamil, Bengali, Urdu…',
  set_language_other_aria: 'Bhasha ka naam',
  set_language_other_note: 'Is bhasha ke liye app text English rahega. Assistant isi bhasha mein jawab dega.',
  // errors
  err_pick_model: 'Pehle model choose karein — composer ke upar wala switcher.',
  err_empty_answer: 'Model ne khaali jawab diya. Dobara try karein, ya model badlein.',
  err_nothing_running: 'Us address pe kuch jawab nahi diya. Service shuru karein, ya provider badlein.',
  err_offline: 'Internet se connection nahi ho pa raha. Network check karein.',
  err_timeout: 'Waqt pe jawab nahi aaya. Model load ho raha hoga; dobara try karein.',
  err_something: 'Kuch gadbad ho gayi. Dobara try karein.',
  // app shell
  app_opening: 'Khul raha hai…',
  err_key_rejected: 'Key reject ho gayi. Settings mein check kijiye, ya doosra provider chuniye.',
  err_model_not_found: 'Wah model ya address nahi mila. Model naam check kijiye.',
  err_rate_limited: 'Provider ne rate limit laga diya. Thodi der rukiye ya model badlein.',
  err_out_of_credit: 'Us account mein credit khatam hai.',
  err_rejected_request: 'Provider ne request reject kar di. Settings mein model naam check kijiye.',
  err_provider_down: 'Provider ko kuch takleef ho rahi hai. Thodi der baad koshish kijiye.',
  err_request_failed: 'Request fail ho gayi.',
  prov_custom_base_url: 'Settings mein is provider ka base URL daaliye.',
  prov_custom_model_name: 'Settings mein is provider ka model naam daaliye.',
  prov_custom_model_list: 'Us address ne model list nahi di. Model naam khud type kijiye.',
  prov_gemini_models: 'Gemini ne kuch unexpected model list bheji hai.',
  prov_ollama_answer: 'Ollama ne kuch unexpected jawab diya. Host address check kijiye.',
  prov_omniroute_models: 'OmniRoute ne kuch unexpected model list bheji hai.',
  prov_openrouter_models: 'OpenRouter ne kuch unexpected model list bheji hai.',
  prov_gemini_blocked: 'Gemini ne safety filter ki wajah se yeh jawab block kar diya.',
}

export const HINDI = {
  ...ENGLISH,
  // header
  header_chats: 'चैट्स',
  header_show_chats: 'चैट्स दिखाएँ',
  header_hide_chats: 'चैट्स छिपाएँ',
  header_new_chat: 'नई चैट',
  header_settings: 'सेटिंग्स',
  header_settings_aria: 'प्रोवाइडर और सेटिंग्स',
  // theme
  theme_light: 'लाइट',
  theme_dark: 'डार्क',
  theme_switch_light: 'लाइट थीम पर स्विच करें',
  theme_switch_dark: 'डार्क थीम पर स्विच करें',
  // sidebar
  sidebar_chats: 'चैट्स',
  sidebar_new: 'नई चैट',
  sidebar_empty: 'अभी कोई चैट नहीं है। पहला मैसेज भेजते ही चैट बन जाएगी।',
  sidebar_rename_aria: '{title} का नाम बदलें',
  sidebar_delete_aria: '{title} हटाएँ',
  sidebar_delete: 'हटाएँ',
  sidebar_name_aria: 'चैट का नाम',
  sidebar_conversations_aria: 'बातचीत',
  // composer
  composer_label: 'मैसेज',
  composer_placeholder_model: 'कुछ भी पूछिए, या "play lofi on youtube"',
  composer_placeholder_no_model: 'पहले मॉडल चुनिए, या "play lofi on youtube"',
  composer_change_model: 'मॉडल बदलें',
  composer_no_model: 'कोई मॉडल नहीं',
  composer_stop: 'रोकें',
  composer_stop_aria: 'जनरेट करना रोकें',
  composer_send: 'भेजें',
  composer_send_aria: 'मैसेज भेजें',
  // empty state
  empty_svg_label: 'एक आइसबर्ग, जिसमें ज़्यादातर पानी के नीचे है',
  empty_hero_1: 'इसका ज़्यादातर हिस्सा',
  empty_hero_2: 'सतह के नीचे है।',
  empty_status_local_zero: 'Ollama चल रहा है। अभी कोई मॉडल डाउनलोड नहीं हुआ।',
  empty_status_local_one: 'Ollama चल रहा है। 1 मॉडल तैयार है।',
  empty_status_local_many: 'Ollama चल रहा है। {n} मॉडल तैयार हैं।',
  empty_status_ready_cloud: '{label}, {model} पर तैयार है।',
  empty_status_down: 'Ollama नहीं चल रहा। इसे चालू करें, या कोई दूसरा प्रोवाइडर चुनें।',
  empty_status_none: 'अभी कोई प्रोवाइडर सेट नहीं है। एक जोड़िए — वह इसी मशीन पर रहेगा।',
  empty_start: 'बातचीत शुरू करें',
  empty_add_provider: 'प्रोवाइडर जोड़ें',
  empty_pick_model: 'मॉडल चुनें',
  empty_first_question: 'पहला सवाल पूछिए',
  empty_first_question_text: 'Race condition क्या है, छोटा उदाहरण देकर समझाइए।',
  empty_meta_ready: 'एक मैसेज दो मीटर। बाईं तरफ़ का गेज गिनती रखता है।',
  empty_meta_keys: 'कीज़ इसी मशीन पर एन्क्रिप्टेड रहती हैं — सिर्फ़ आपके भेजे रिक्वेस्ट के लिए।',
  // message
  msg_computer_task: 'कंप्यूटर टास्क',
  msg_opening: 'खुल रहा है…',
  msg_open: 'खोलें',
  msg_cancel: 'रद्द करें',
  msg_listening: 'जवाब का इंतज़ार है',
  msg_stopped_before: 'जवाब शुरू होने से पहले रोक दिया।',
  msg_stopped: 'रोक दिया',
  msg_copied: 'कॉपी हुआ',
  msg_copy: 'कॉपी',
  msg_copy_aria: 'जवाब कॉपी करें',
  msg_copied_aria: 'जवाब कॉपी हो गया',
  // modal + toasts + code
  modal_close: 'बंद करें',
  toast_dismiss: 'खारिज करें',
  code_copied: 'कॉपी हुआ',
  code_copy: 'कॉपी',
  code_failed: 'कॉपी नहीं हुआ',
  code_copy_aria: 'कोड कॉपी करें',
  // model menu
  menu_choose_aria: 'प्रोवाइडर और मॉडल चुनें',
  menu_providers: 'प्रोवाइडर',
  menu_setup: 'सेटअप',
  menu_provider_setup: 'प्रोवाइडर सेटअप',
  menu_finish_setup: '{label} का सेटअप पूरा करें',
  menu_models: 'मॉडल',
  menu_loading: 'मॉडल ढूँढ रहे हैं…',
  menu_no_models: 'इस प्रोवाइडर पर अभी कोई मॉडल नहीं मिला।',
  menu_start_service: 'टर्मिनल में सर्विस शुरू करें, फिर यह मेन्यू दोबारा खोलें।',
  menu_no_models_yet: 'अभी कोई मॉडल नहीं',
  menu_models_aria: 'मॉडल',
  // model pull
  pull_title: 'मॉडल डाउनलोड करें',
  pull_using: '{model} चल रहा है',
  pull_aria: 'कौन सा मॉडल डाउनलोड करें',
  pull_button: 'डाउनलोड करें',
  pull_stop: 'रोकें',
  pull_ready: 'तैयार',
  pull_cancelled: 'रद्द हुआ',
  pull_aria_pulling: '{model} डाउनलोड हो रहा है',
  pull_ready_toast: '{model} Ollama पर तैयार है।',
  pull_stopped: 'डाउनलोड रोक दिया गया।',
  pull_try_again: 'फिर कोशिश करें',
  pull_installed: 'मॉडल इसी मशीन पर इंस्टॉल हो गया।',
  pull_done: 'हो गया',
  // ollama installer
  oli_installed_not_running_title: 'Ollama इंस्टॉल है, पर चल नहीं रहा',
  oli_installed_not_running_desc: 'IceBurg को इस मशीन पर Ollama मिला, पर पोर्ट 11434 पर कोई जवाब नहीं दे रहा।',
  oli_not_running_body: 'Ollama ऐप खोलिए, या टर्मिनल में `ollama serve` चलाइए, फिर दोबारा जाँचिए।',
  oli_check_again: 'दोबारा जाँचें',
  oli_use_cloud: 'क्लाउड प्रोवाइडर इस्तेमाल करें',
  oli_still_nothing: 'पोर्ट 11434 पर अभी भी कुछ नहीं है। कुछ सेकंड दीजिए और फिर जाँचिए।',
  oli_ask_title: 'Ollama इंस्टॉल नहीं है',
  oli_ask_desc: 'Ollama इस कंप्यूटर पर मॉडल चलाता है — प्राइवेट, और बिना किसी की के।',
  oli_ask_body: 'अभी इंस्टॉल कीजिए, IceBurg अपने आप ढूँढ लेगा। चाहें तो क्लाउड प्रोवाइडर के साथ आगे बढ़ सकते हैं।',
  oli_install: 'Ollama इंस्टॉल करें',
  oli_not_now: 'अभी नहीं',
  oli_ask_note: 'आधिकारिक इंस्टॉलर ollama.com से आता है। Windows और macOS पर इंस्टॉलर खुलता है; Linux पर टर्मिनल में स्क्रिप्ट चलती है।',
  oli_installing: 'Ollama इंस्टॉल हो रहा है',
  oli_working: 'काम चल रहा है…',
  oli_still_waiting: 'इंस्टॉलर की प्रतीक्षा है। कोई ऐप खुल गया होगा — उसे देखिए।',
  oli_installed_body: 'इंस्टॉलर पूरा होने पर वापस आकर दोबारा जाँचिए। Ollama को एक बार चालू करना पड़ सकता है।',
  oli_close: 'बंद करें',
  oli_failed_title: 'Ollama इंस्टॉल नहीं हुआ',
  oli_try_again: 'फिर कोशिश करें',
  oli_open_install: 'इंस्टॉल पेज खोलें',
  oli_finish_installer: 'इंस्टॉलर को पूरा होने दीजिए, फिर यहीं वापस आकर जाँचिए।',
  oli_script_running: 'आधिकारिक स्क्रिप्ट आपके टर्मिनल में चल रही है। sudo प्रॉम्प्ट दिखे तो नज़र रखिए।',
  oli_nothing_yet: 'पोर्ट 11434 पर अभी कोई जवाब नहीं दे रहा। Ollama चालू कीजिए, फिर जाँचिए।',
  oli_did_not_start: 'इंस्टॉल शुरू नहीं हुआ।',
  oli_opening: 'आधिकारिक इंस्टॉलर खुल रहा है…',
  oli_could_not_open: 'इंस्टॉलर नहीं खुल पाया।',
  // settings dialog
  set_desc: 'कीज़ इसी मशीन पर एन्क्रिप्टेड रहती हैं और सिर्फ़ आपके भेजे रिक्वेस्ट के लिए इस्तेमाल होती हैं।',
  set_providers_aria: 'प्रोवाइडर',
  set_appearance: 'दिखावट',
  set_keys_keychain: 'कीज़ सिस्टम कीचेन में एन्क्रिप्टेड हैं ({platform})।',
  set_keys_no_keyring: 'इस सिस्टम में कोई कीरिंग नहीं है, इसलिए कीज़ सिर्फ़ obfuscated हैं, एन्क्रिप्टेड नहीं।',
  set_keys_checking: 'देख रहे हैं कि कीज़ कैसे स्टोर होंगी…',
  set_in_use: 'इस्तेमाल में',
  set_use_provider: 'यह प्रोवाइडर इस्तेमाल करें',
  set_ollama_not_running: 'Ollama इंस्टॉल है पर चल नहीं रहा। चालू करें, या नीचे से फिर इंस्टॉल करें।',
  set_ollama_not_installed: 'Ollama इंस्टॉल नहीं है। यह इसी मशीन पर मॉडल चलाता है, बिना किसी की के।',
  set_how_start: 'कैसे चालू करें',
  set_ollama_running: 'Ollama चल रहा है और इस मशीन पर जवाब दे रहा है।',
  set_installed_models: 'इंस्टॉल मॉडल',
  set_choose_one: '{n} में से एक चुनें',
  set_name: 'नाम',
  set_base_url_note: 'जब तक Ollama दूसरे पोर्ट या मशीन पर न हो, इसे मत बदलिए।',
  set_api_key: 'API की',
  set_where_key: 'यह कहाँ से मिलेगी?',
  set_key_saved_on_machine: 'की इसी मशीन पर सेव है',
  set_key_remove: 'हटाएँ',
  set_key_replace: 'बदलें',
  set_paste_key: 'की पेस्ट करें',
  set_save_key: 'की सेव करें',
  set_key_optional: 'वैकल्पिक: अगर राउटर को की नहीं चाहिए तो खाली छोड़ दें।',
  set_saved_flash: 'सेव हो गया।',
  set_model_name: 'मॉडल का नाम',
  set_model_placeholder: 'वह मॉडल id जो आपका सर्वर उम्मीद करता है',
  set_model_note: 'नीचे टेस्ट से सर्वर से पूछिए; मॉडल सूची आ जाए तो स्विचर से चुनिए।',
  set_model: 'मॉडल',
  set_model_menu_placeholder: 'मॉडल मेन्यू से चुनिए, या नाम टाइप कीजिए',
  set_test_connection: 'कनेक्शन टेस्ट करें',
  set_testing: 'टेस्ट हो रहा है…',
  set_connected_none: 'कनेक्टेड है, पर अभी कोई मॉडल उपलब्ध नहीं है।',
  set_connected_one: 'कनेक्टेड। 1 मॉडल उपलब्ध है।',
  set_connected_some: 'कनेक्टेड। {n} मॉडल उपलब्ध हैं।',
  set_one_model: '1 मॉडल',
  set_models: '{n} मॉडल',
  set_key_saved_toast: '{name} के लिए की सेव हो गई।',
  set_key_removed_toast: '{name} की की हटा दी गई।',
  // language section
  set_language_section: 'भाषा',
  set_language_label: 'ऐप और जवाब की भाषा',
  set_language_caption: 'असिस्टेंट हमेशा इसी भाषा में जवाब देगा, चाहे आप किसी भी भाषा में लिखें। ऐप का टेक्स्ट Hinglish, English और Hindi में है — किसी दूसरी भाषा के लिए इंटरफ़ेस English रहेगा।',
  set_language_other_placeholder: 'जैसे Tamil, Bengali, Urdu…',
  set_language_other_aria: 'भाषा का नाम',
  set_language_other_note: 'इस भाषा में ऐप का टेक्स्ट English रहेगा। असिस्टेंट इसी भाषा में जवाब देगा।',
  // errors
  err_pick_model: 'पहले मॉडल चुनिए — कंपोज़र के ऊपर वाला स्विचर।',
  err_empty_answer: 'मॉडल ने खाली जवाब दिया। फिर कोशिश करें, या मॉडल बदलें।',
  err_nothing_running: 'उस पते पर किसी ने जवाब नहीं दिया। सर्विस चालू करें, या प्रोवाइडर बदलें।',
  err_offline: 'नेटवर्क से कनेक्ट नहीं हो पा रहा। अपना कनेक्शन जाँचें।',
  err_timeout: 'समय पर जवाब नहीं आया। मॉडल लोड हो रहा होगा; फिर कोशिश करें।',
  err_something: 'कुछ गड़बड़ हो गई। फिर कोशिश करें।',
  // app shell
  app_opening: 'खुल रहा है…',
  // additions (hindi-only literals; inherit elsewhere)
  chat_conversation_aria: 'बातचीत',
  setup_ready: 'तैयार',
  err_stopped: 'रुक गया।',
  header_streaming: 'स्ट्रीमिंग',
  language_hinglish: 'Hinglish',
  language_english: 'English',
  language_hindi: 'हिन्दी',
  language_other: 'कुछ और…',
  set_title: 'प्रोवाइडर और मॉडल',
  set_host: 'होस्ट',
  set_base_url: 'बेस URL',
  set_install_ollama: 'Ollama इंस्टॉल करें',
  err_key_rejected: 'की अस्वीकार हो गई। सेटिंग्स में जाँचिए, या कोई और प्रोवाइडर चुनिए।',
  err_model_not_found: 'वह मॉडल या पता नहीं मिला। मॉडल का नाम जाँचिए।',
  err_rate_limited: 'प्रोवाइडर ने रेट लिमिट लगा दी है। थोड़ा इंतज़ार कीजिए या मॉडल बदलिए।',
  err_out_of_credit: 'उस अकाउंट में क्रेडिट खत्म है।',
  err_rejected_request: 'प्रोवाइडर ने रिक्वेस्ट अस्वीकार कर दी। सेटिंग्स में मॉडल का नाम जाँचिए।',
  err_provider_down: 'प्रोवाइडर को कुछ दिक्कत हो रही है। थोड़ी देर बाद कोशिश कीजिए।',
  err_request_failed: 'रिक्वेस्ट विफल हुई।',
  prov_custom_base_url: 'सेटिंग्स में इस प्रोवाइडर का बेस URL डालिए।',
  prov_custom_model_name: 'सेटिंग्स में इस प्रोवाइडर का मॉडल का नाम डालिए।',
  prov_custom_model_list: 'उस पते ने मॉडल सूची नहीं दी। मॉडल का नाम खुद टाइप कीजिए।',
  prov_gemini_models: 'Gemini ने कुछ अप्रत्याशित मॉडल सूची भेजी है।',
  prov_ollama_answer: 'Ollama ने कुछ अप्रत्याशित जवाब दिया। होस्ट पता जाँचिए।',
  prov_omniroute_models: 'OmniRoute ने कुछ अप्रत्याशित मॉडल सूची भेजी है।',
  prov_openrouter_models: 'OpenRouter ने कुछ अप्रत्याशित मॉडल सूची भेजी है।',
  prov_gemini_blocked: 'Gemini ने सेफ़्टी फ़िल्टर की वजह से यह जवाब रोक दिया।',
}

const DICTS = { english: ENGLISH, hinglish: HINGLISH, hindi: HINDI }

/* Providers and other import-time modules cannot reach the settings store
   without creating an import cycle, so the settings store tells us here when
   the configured language changes. translate() callers that pass an explicit
   language never notice the difference. */
let activeLanguage = 'hinglish'

export function setActiveLanguage(language) {
  activeLanguage = typeof language === 'string' && language.trim() ? language.trim() : 'hinglish'
}

export function getActiveLanguage() {
  return activeLanguage
}

export const UI_LANGUAGES = ['hinglish', 'english', 'hindi']
export const DEFAULT_LANGUAGE = 'hinglish'

/** The dictionary that will actually render the UI for this setting value. */
export function uiLang(language) {
  return UI_LANGUAGES.includes(language) ? language : 'english'
}

export function isOtherLanguage(language) {
  return Boolean(language) && !UI_LANGUAGES.includes(language)
}

/** A human name for the configured language, for toasts and prompts. */
export function languageLabel(language) {
  switch (language) {
    case 'hinglish': return 'Hinglish'
    case 'english': return 'English'
    case 'hindi': return 'Hindi'
    default: {
      const value = String(language || 'Hinglish').trim()
      return value.charAt(0).toUpperCase() + value.slice(1)
    }
  }
}

/** Translate one key, with {placeholders} filled from vars. Falls back to English, then the key. */
export function translate(language, key, vars) {
  const dict = DICTS[uiLang(language)] || ENGLISH
  let value = dict[key] ?? ENGLISH[key] ?? key
  if (vars) {
    for (const [name, replacement] of Object.entries(vars)) {
      value = value.replaceAll(`{${name}}`, String(replacement))
    }
  }
  return value
}

/** The system message that makes the model answer in the configured language. */
export function systemPromptFor(language) {
  const wanted = languageLabel(language)
  switch (language) {
    case 'hinglish':
      return 'You are a helpful assistant. You ALWAYS reply in Hinglish: Hindi written in the Latin (roman) alphabet mixed with everyday English, the way young urban Indians text each other — natural, warm, informal. Even if the user writes in another language, your reply must be Hinglish. Keep technical terms in English.'
    case 'english':
      return 'You are a helpful assistant. You ALWAYS reply in English, even if the user writes in another language.'
    case 'hindi':
      return 'You are a helpful assistant. You ALWAYS reply in simple Hindi written in the Devanagari script, even if the user writes in another language. Technical terms may stay in English.'
    default:
      return `You are a helpful assistant. You ALWAYS reply in ${wanted}, even if the user writes in another language. Keep it natural for a native speaker of ${wanted}.`
  }
}

/** Sanity guard used by tests: every shipped dictionary covers every English key. */
export function missingKeys() {
  const missing = {}
  for (const [lang, dict] of Object.entries(DICTS)) {
    missing[lang] = Object.keys(ENGLISH).filter((key) => !(key in dict))
  }
  return missing
}
