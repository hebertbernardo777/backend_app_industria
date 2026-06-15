// ecosystem.config.cjs
module.exports = {
    apps: [
      {
        name: "backend-industria",
        cwd: __dirname,
        script: "./dist/server.js",
  
        instances: 1,
        exec_mode: "fork",
        watch: false,
        autorestart: true,
        max_memory_restart: "700M",
  
        env_production: {
          NODE_ENV: "production",
          HTTP_PORT: 5010,
  
          DB_SANKHYA_USER: "sankhya",
          DB_SANKHYA_PASS: "tecsis",
          DB_SANKHYA_URL: "10.0.10.244:1521/ORCL",
  
          JWT_SECRET: "d8963cc9bd491cfa5264d994696c1bb7",
          JWT_EXPIRES_IN: "24h",
  
          UPLOAD_PATH: "/mnt/chamados",
  
          PRINTER_IP: "10.0.0.50",
          PRINTER_PORT: 9100,
  
          LOGO_PATH: "./src/assets/logo.png",
          ZPL_DPI: 300,
  
          COMPANY_NAME: "MAISPVC Indústria e Comércio",
          COMPANY_ADDR1: "Rua Exemplo, 1000 - Distrito Industrial",
          COMPANY_ADDR2: "Goiânia GO 74000-000",
          COMPANY_ADDR3: "Brasil",
          COMPANY_UF: "GO",
          COMPANY_PERMIT_LABEL: "Permit",
          COMPANY_PERMIT_NUM: 123456
        }
      }
    ]
  };