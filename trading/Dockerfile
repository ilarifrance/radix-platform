# Server sempre acceso per il conto vero e la raccolta dati (es. Railway). Vedi README «Server sempre acceso».
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY radix_trading ./radix_trading
ENV RADIX_TRADING_DATA=/data PYTHONUNBUFFERED=1
VOLUME ["/data"]
CMD ["python", "-m", "radix_trading", "serve"]
