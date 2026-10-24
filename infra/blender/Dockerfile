FROM python:3.11-slim-bookworm
ARG BLENDER_SHA256=7f2475990613c8d4c7ac5697803fcf40d09541c1fd8c23936f4b07a169a920c7
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl xz-utils libx11-6 libxi6 libxxf86vm1 libxfixes3 libxrender1 libgl1 libegl1 libsm6 libice6 libxkbcommon0 libdbus-1-3 libgomp1 libpulse0 libxrandr2 libxcursor1 libxinerama1 libfontconfig1 && rm -rf /var/lib/apt/lists/*
RUN curl --fail --location --retry 2 https://download.blender.org/release/Blender5.1/blender-5.1.0-linux-x64.tar.xz -o /tmp/blender.tar.xz && echo "$BLENDER_SHA256  /tmp/blender.tar.xz" | sha256sum --check && mkdir /opt/blender && tar -xJf /tmp/blender.tar.xz --strip-components=1 -C /opt/blender && rm /tmp/blender.tar.xz
RUN useradd --create-home --uid 10001 blender
WORKDIR /opt/blackblend
COPY blender/window_edit.py blender/window_edit.py
COPY scripts/export-studio-scene.py scripts/export-studio-scene.py
COPY tests/native-window.blender.py tests/native-window.blender.py
COPY infra/blender/server.py server.py
ENV BLENDER_PATH=/opt/blender/blender PORT=8080 PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
USER blender
EXPOSE 8080
CMD ["python3", "server.py"]
