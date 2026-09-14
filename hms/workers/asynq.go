package workers

import (
	"context"
	"log"
	"os"
	"strings"

	"github.com/hibiken/asynq"
)

var AsynqClient *asynq.Client

func getRedisOpt() asynq.RedisConnOpt {
	addr := strings.TrimSpace(os.Getenv("REDIS_ADDR"))
	if addr == "" {
		addr = os.Getenv("REDIS_ADDR")
		if addr == "" {
			addr = "localhost:6379"
		}
	}
	password := os.Getenv("REDIS_PASSWORD")

	return asynq.RedisClientOpt{
		Addr:     addr,
		Password: password,
		DB:       0,
	}
}

// InitAsynqClient initializes the global Asynq client used to enqueue jobs.
func InitAsynqClient() {
	redisOpt := getRedisOpt()
	AsynqClient = asynq.NewClient(redisOpt)
	log.Println("[asynq] Client initialized.")
}

// StartWorkerServer starts the background processing server.
// This should be run in a goroutine.
func StartWorkerServer() {
	redisOpt := getRedisOpt()

	srv := asynq.NewServer(
		redisOpt,
		asynq.Config{
			Concurrency: 10, // Number of concurrent workers
			Queues: map[string]int{
				"critical": 6,
				"default":  3,
				"low":      1,
			},
			ErrorHandler: asynq.ErrorHandlerFunc(func(ctx context.Context, task *asynq.Task, err error) {
				log.Printf("[asynq] Task %s failed: %v\n", task.Type(), err)
			}),
		},
	)

	mux := asynq.NewServeMux()
	mux.HandleFunc(TypeInventorySync, HandleInventorySyncTask)

	log.Println("[asynq] Starting worker server...")
	if err := srv.Run(mux); err != nil {
		log.Fatalf("[asynq] Could not run server: %v", err)
	}
}
