FROM python:3.9-slim

WORKDIR /app

COPY requirements.txt ./
RUN python -m venv venv && ./venv/bin/pip install -r requirements.txt

COPY . .

CMD ["./venv/bin/python", "src/main.py"]
