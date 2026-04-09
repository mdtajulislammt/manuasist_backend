flowchart TB
    subgraph Clients["Clients"]
        Flutter["Flutter App (iOS/Android)"]
        Admin["Web Admin (React/Next.js)"]
    end

    subgraph External["External Services"]
        AppleAuth["Sign in with Apple"]
        GoogleAuth["Google Sign-In"]
        AppleIAP["App Store / StoreKit"]
        GoogleIAP["Google Play Billing"]
        OCR["OCR (ML Kit / Vision)"]
        LLM["LLM (OpenAI/Claude)"]
    end

    subgraph Backend["Backend API (NestJS/Fastify)"]
        Gateway["API Gateway\n(rate limit, trace_id)"]
        Auth["Auth Service"]
        Sub["Subscription Service\n(receipt verify)"]
        Pref["Preferences Service"]
        ScansAPI["Scans API\n(POST /scans → enqueue)"]
        NAI["NAI / Dashboard Service"]
        AdminAPI["Admin API"]
    end

    subgraph Pipeline["Async Scan Pipeline"]
        Queue["Job Queue (Redis/BullMQ)"]
        Worker["Worker(s)\nOCR → LLM → scoring"]
        Storage["Object Storage\n(menu images)"]
    end

    subgraph Data["Data"]
        DB[(PostgreSQL)]
    end

    Flutter --> AppleAuth
    Flutter --> GoogleAuth
    Flutter --> AppleIAP
    Flutter --> GoogleIAP
    Flutter --> Gateway
    Admin --> Gateway

    Gateway --> Auth
    Gateway --> Sub
    Gateway --> Pref
    Gateway --> ScansAPI
    Gateway --> NAI
    Gateway --> AdminAPI

    Auth --> AppleAuth
    Auth --> GoogleAuth
    Sub --> AppleIAP
    Sub --> GoogleIAP

    ScansAPI --> Storage
    ScansAPI --> Queue
    Queue --> Worker
    Worker --> OCR
    Worker --> LLM
    Worker --> DB
    Worker --> Storage

    Auth --> DB
    Sub --> DB
    Pref --> DB
    NAI --> DB
    AdminAPI --> DB