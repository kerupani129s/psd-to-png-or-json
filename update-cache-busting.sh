#!/bin/bash
set -euoo pipefail posix

# 
readonly PSD_JS_LIB_PARAM='v=3.4.0'
readonly JSZIP_LIB_PARAM='v=3.9.1'

# 
function content_hash() {
	local -r file="$1"
	openssl md4 "$file" | awk '{ print substr($NF, 0, 20) }'
	return 0
}

# 
SITE_CSS_PARAM="v=$(content_hash ./docs/site.css)"
readonly SITE_CSS_PARAM

CONVERTER_MAIN_CSS_PARAM="v=$(content_hash ./docs/main.css)"
readonly CONVERTER_MAIN_CSS_PARAM
CONVERTER_MAIN_JS_PARAM="v=$(content_hash ./docs/main.js)"
readonly CONVERTER_MAIN_JS_PARAM

VIEWER_MAIN_CSS_PARAM="v=$(content_hash ./docs/viewer/main.css)"
readonly VIEWER_MAIN_CSS_PARAM
VIEWER_VIEWER_JS_PARAM="v=$(content_hash ./docs/viewer/viewer.js)"
readonly VIEWER_VIEWER_JS_PARAM
VIEWER_MAIN_JS_PARAM="v=$(content_hash ./docs/viewer/main.js)"
readonly VIEWER_MAIN_JS_PARAM

# 
sed -Ei \
	-e 's/(["/]site\.css\?)[^"]*/\1'"$SITE_CSS_PARAM"'/g' \
	-e 's/(["/]main\.css\?)[^"]*/\1'"$CONVERTER_MAIN_CSS_PARAM"'/g' \
	-e 's/(["/]psd\.min\.js\?)[^"]*/\1'"$PSD_JS_LIB_PARAM"'/g' \
	-e 's/(["/]jszip\.min\.js\?)[^"]*/\1'"$JSZIP_LIB_PARAM"'/g' \
	-e 's/(["/]main\.js\?)[^"]*/\1'"$CONVERTER_MAIN_JS_PARAM"'/g' \
	./docs/index.html ./docs/ja/index.html

sed -Ei \
	-e 's/(["/]site\.css\?)[^"]*/\1'"$SITE_CSS_PARAM"'/g' \
	-e 's/(["/]main\.css\?)[^"]*/\1'"$VIEWER_MAIN_CSS_PARAM"'/g' \
	-e 's/(["/]viewer\.js\?)[^"]*/\1'"$VIEWER_VIEWER_JS_PARAM"'/g' \
	-e 's/(["/]main\.js\?)[^"]*/\1'"$VIEWER_MAIN_JS_PARAM"'/g' \
	./docs/viewer/index.html ./docs/ja/viewer/index.html

sed -Ei \
	-e 's/(["/]site\.css\?)[^"]*/\1'"$SITE_CSS_PARAM"'/g' \
	./docs/license/index.html ./docs/ja/license/index.html \
	./docs/third-party-licenses/index.html ./docs/ja/third-party-licenses/index.html

# 
echo 'OK'
