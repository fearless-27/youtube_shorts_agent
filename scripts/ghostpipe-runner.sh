#!/bin/bash
# GhostPipe v5.1 - 24/7 Runner Script
# Place in /usr/local/bin/ghostpipe-runner

PIPELINE_DIR="/opt/ghostpipe"
LOG_DIR="/var/log/ghostpipe"
PID_FILE="/var/run/ghostpipe.pid"
VENV_DIR="$PIPELINE_DIR/venv"

# Create directories
mkdir -p $LOG_DIR

case "$1" in
    start)
        if [ -f $PID_FILE ] && kill -0 $(cat $PID_FILE) 2>/dev/null; then
            echo "GhostPipe is already running (PID: $(cat $PID_FILE))"
            exit 1
        fi

        echo "🚀 Starting GhostPipe v5.1..."
        cd $PIPELINE_DIR

        # Activate virtual environment
        source $VENV_DIR/bin/activate

        # Start pipeline with logging
        nohup python pipeline/ghostpipe_v5_1_pipeline.py >> $LOG_DIR/pipeline.log 2>&1 &

        echo $! > $PID_FILE
        echo "✅ GhostPipe started (PID: $!)"
        echo "📊 Logs: tail -f $LOG_DIR/pipeline.log"
        ;;

    stop)
        if [ ! -f $PID_FILE ]; then
            echo "GhostPipe is not running"
            exit 1
        fi

        PID=$(cat $PID_FILE)
        echo "🛑 Stopping GhostPipe (PID: $PID)..."
        kill -TERM $PID 2>/dev/null

        # Wait for graceful shutdown
        for i in {1..30}; do
            if ! kill -0 $PID 2>/dev/null; then
                echo "✅ GhostPipe stopped gracefully"
                rm -f $PID_FILE
                exit 0
            fi
            sleep 1
        done

        # Force kill if still running
        echo "⚠️ Force killing GhostPipe..."
        kill -9 $PID 2>/dev/null
        rm -f $PID_FILE
        echo "✅ GhostPipe force stopped"
        ;;

    restart)
        $0 stop
        sleep 2
        $0 start
        ;;

    status)
        if [ -f $PID_FILE ] && kill -0 $(cat $PID_FILE) 2>/dev/null; then
            echo "✅ GhostPipe is running (PID: $(cat $PID_FILE))"
            echo "📊 Uptime: $(ps -o etime= -p $(cat $PID_FILE))"
            echo "📈 Memory: $(ps -o %mem= -p $(cat $PID_FILE))%"
            echo "📝 Latest log:"
            tail -n 5 $LOG_DIR/pipeline.log
        else
            echo "❌ GhostPipe is not running"
            rm -f $PID_FILE 2>/dev/null
        fi
        ;;

    logs)
        tail -f $LOG_DIR/pipeline.log
        ;;

    dry-run)
        echo "🔬 Starting 7-day dry-run tuning mode..."
        export GHOSTPIPE_MODE=dry_run
        $0 start
        echo "⏰ Will generate tuning report in 7 days"
        echo "📊 Check: $LOG_DIR/weekly_tuning_report.json"
        ;;

    report)
        if [ -f $PIPELINE_DIR/weekly_tuning_report.json ]; then
            echo "📋 Latest Tuning Report:"
            cat $PIPELINE_DIR/weekly_tuning_report.json | python -m json.tool
        else
            echo "❌ No tuning report found. Run dry-run first."
        fi
        ;;

    *)
        echo "Usage: $0 {start|stop|restart|status|logs|dry-run|report}"
        echo ""
        echo "Commands:"
        echo "  start     - Start the 24/7 pipeline"
        echo "  stop      - Graceful shutdown"
        echo "  restart   - Restart pipeline"
        echo "  status    - Check pipeline health"
        echo "  logs      - View real-time logs"
        echo "  dry-run   - Start 7-day tuning mode (no uploads)"
        echo "  report    - View latest tuning report"
        exit 1
        ;;
esac
